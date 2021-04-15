const Bytes        = imports.byteArray
const GObject      = imports.gi.GObject
const Gio          = imports.gi.Gio
const GLib         = imports.gi.GLib
const Shell        = imports.gi.Shell
const Main         = imports.ui.main
const AppFavorites = imports.ui.appFavorites
const Me           = imports.misc.extensionUtils.getCurrentExtension()
const Convenience  = Me.imports.convenience

const DOCK_ID = 'dock1'
const APPS_ID = 'net.launchpad.plank.AppsLauncher'

const SCHEMA_NAME = 'net.launchpad.plank.dock.settings'
const SCHEMA_PATH = `/net/launchpad/plank/docks/${DOCK_ID}/`

const BUSNAME = 'net.launchpad.plank'
const BUSPATH = '/net/launchpad/plank'

function dbusProxy(filename, ...args) {
  const path = GLib.build_filenamev([Me.path, 'interfaces', `${filename}.xml`])
  const data = GLib.file_get_contents(path)

  try {
    const DBusIFace = Bytes.toString(data[1])
    const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIFace)

    return new DBusProxy(Gio.DBus.session, ...args)
  } catch (e) {
    return null
  }
}

function copyFile(file, dest, once = true, parse = val => val) {
  const filePath = GLib.build_filenamev([Me.path, file])
  const fileName = GLib.path_get_basename(filePath)

  const homePath = GLib.get_home_dir()
  const destPath = GLib.build_filenamev([homePath, dest, fileName])

  if (once && GLib.file_test(destPath, GLib.FileTest.EXISTS)) return

  const text = GLib.file_get_contents(filePath)
  const data = parse(Bytes.toString(text[1]))

  GLib.mkdir_with_parents(GLib.path_get_dirname(destPath), parseInt('0700', 8))
  GLib.file_set_contents(destPath, data)
}

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false
  return !arr1.some((val, idx) => val !== arr2[idx])
}

class PlankTheme {
  constructor(settings) {
    this.name     = 'DashToPlank'
    this.settings = settings
  }

  get position() {
    return this.settings.get_string('position')
  }

  get alignment() {
    return this.settings.get_string('alignment')
  }

  get vertical() {
    return ['left', 'right'].includes(this.position)
  }

  get panelMode() {
    return this.alignment == 'fill'
  }

  get paddingX() {
    return this.vertical ? (this.panelMode ? 13 : 4) : 1
  }

  get paddingY() {
    return this.vertical ? 8 : 6
  }

  _parse(data) {
    let value = data

    value = value.replace(/{{paddingX}}/g, this.paddingX)
    value = value.replace(/{{paddingY}}/g, this.paddingY)

    return value
  }

  _update() {
    const file = 'theme/dock.theme'
    const dest = `.local/share/plank/themes/${this.name}`

    copyFile(file, dest, false, this._parse.bind(this))
  }

  enable() {
    this._update()
    this.settings.set_string('theme', this.name)
  }

  activate() {
    this._positionHandlerID = this.settings.connect(
      'changed::position',
      this._update.bind(this)
    )

    this._alignmentHandlerID = this.settings.connect(
      'changed::alignment',
      this._update.bind(this)
    )

    this._update()
  }

  destroy() {
    if (this._positionHandlerID) {
      this.settings.disconnect(this._positionHandlerID)
      this._positionHandlerID = null
    }

    if (this._alignmentHandlerID) {
      this.settings.disconnect(this._alignmentHandlerID)
      this._alignmentHandlerID = null
    }
  }
}

var DashToPlank = GObject.registerClass(
  class DashToPlank extends GObject.Object {
    _init() {
      this.settings  = Convenience.getSettings()
      this.favorites = AppFavorites.getAppFavorites()

      this.appSystem = Shell.AppSystem.get_default()
      this.appObject = this.lookupApp('plank.desktop')

      this.itemsConf = Gio.Settings.new_with_path(SCHEMA_NAME, SCHEMA_PATH)
      this.dockTheme = new PlankTheme(this.itemsConf)

      this.plankDbus = dbusProxy('plank', BUSNAME, BUSPATH)
      this.itemsDbus = dbusProxy('items', BUSNAME, `${BUSPATH}/${DOCK_ID}`)
    }

    get isConnected() {
      try {
        this.plankDbus.PingSync()
        return true
      } catch (e) {
        return false
      }
    }

    get favoriteApps() {
      const items = this.favorites.getFavorites()
      return items.map(app => this.getAppUri(app))
    }

    get persistentApps() {
      const items = this.itemsDbus.GetPersistentApplicationsSync()[0]
      return items.filter(uri => !uri.endsWith(`${APPS_ID}.desktop`))
    }

    get dockItems() {
      const value = this.itemsConf.get_strv('dock-items')
      const items = value.map(item => this.getItemUri(item))

      return items.filter(uri => !!uri && !uri.endsWith(`${APPS_ID}.desktop`))
    }

    lookupApp(desktopId) {
      return this.appSystem.lookup_app(desktopId)
    }

    getAppUri(app) {
      return app && `file://${app.app_info.get_filename()}`
    }

    getItemUri(item) {
      const appId = item.replace(/\.dockitem$/, '.desktop')
      return this.getAppUri(this.lookupApp(appId))
    }

    getAppId(uri) {
      return uri.split('/').pop()
    }

    addToDash(uri, pos = -1) {
      const appId = this.getAppId(uri)
      this.favorites.addFavoriteAtPos(appId, pos)
    }

    removeFromDash(uri) {
      const appId = this.getAppId(uri)
      this.favorites.removeFavorite(appId)
    }

    moveInDash(uri, pos) {
      const appId = this.getAppId(uri)
      this.favorites.moveFavoriteToPos(appId, pos)
    }

    addToDock(uri) {
      this.itemsDbus.AddSync(uri)
    }

    removeFromDock(uri) {
      this.itemsDbus.RemoveSync(uri)
    }

    _withLock(callback) {
      if (!this._updatesLocked) {
        this._updatesLocked = true
        callback()
        this._updatesLocked = false
      }
    }

    _withPinnedOnly(callback) {
      const value = this.itemsConf.get_boolean('pinned-only')
      this.itemsConf.set_boolean('pinned-only', true)

      callback()
      this.itemsConf.set_boolean('pinned-only', value)
    }

    _addAppsLauncher() {
      const appId = `${APPS_ID}.dockitem`
      const items = this.itemsConf.get_strv('dock-items')

      if (!items.includes(appId)) {
        const home = GLib.get_home_dir()
        const apps = '.local/share/applications'
        const path = GLib.build_filenamev([home, apps, `${APPS_ID}.desktop`])

        this.addToDock(`file://${path}`)
      }
    }

    _copyAppsLauncherFiles() {
      const deskFile = `launchers/${APPS_ID}.desktop`
      const deskPath = '.local/share/applications'

      const iconFile = `launchers/${APPS_ID}.svg`
      const iconPath = '.icons/hicolor/scalable/apps'

      copyFile(deskFile, deskPath)
      copyFile(iconFile, iconPath)
    }

    _onInitialize() {
      if (this.settings.get_boolean('initialized')) {
        return this._addAppsLauncher()
      }

      this._addAppsLauncher()
      this.dockTheme.enable()

      this.settings.set_boolean('initialized', true)
    }

    _onConnectionAcquired() {
      this._onInitialize()

      this._dashHandlerID = this.favorites.connect(
        'changed',
        this._onFavoritesChanged.bind(this)
      )

      this._dockHandlerID = this.itemsDbus.connectSignal(
        'Changed',
        this._onPersistentChanged.bind(this)
      )

      this._sortHandlerID = this.itemsConf.connect(
        'changed::dock-items',
        this._onDockOrderChanged.bind(this)
      )
    }

    _onConnectionLost() {
      if (this._dashHandlerID) {
        this.favorites.disconnect(this._dashHandlerID)
        this._dashHandlerID = null
      }

      if (this._dockHandlerID) {
        this.itemsDbus.disconnectSignal(this._dockHandlerID)
        this._dockHandlerID = null
      }

      if (this._sortHandlerID) {
        this.itemsConf.disconnect(this._sortHandlerID)
        this._sortHandlerID = null
      }
    }

    _onFavoritesChanged() {
      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.persistentApps

        if (arraysEqual(dash, dock)) return

        const head = [...dash]
        const last = head.pop()

        if (arraysEqual(head, dock)) {
          return this.addToDock(last)
        }

        this._withPinnedOnly(() => {
          dock.forEach(uri => this.removeFromDock(uri))
          dash.forEach(uri => this.addToDock(uri))
        })
      })
    }

    _onPersistentChanged() {
      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.persistentApps

        dock.forEach(uri => !dash.includes(uri) && this.addToDash(uri))
        dash.forEach(uri => !dock.includes(uri) && this.removeFromDash(uri))
      })
    }

    _onDockOrderChanged() {
      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.dockItems

        dock.forEach((uri, idx) => idx != dash.indexOf(uri) && this.moveInDash(uri, idx))
      })
    }

    activate() {
      this.dockTheme.activate()
      this._copyAppsLauncherFiles()

      this._connectionHandlerID = Gio.bus_watch_name_on_connection(
        Gio.DBus.session,
        BUSNAME,
        Gio.BusNameOwnerFlags.NONE,
        this._onConnectionAcquired.bind(this),
        this._onConnectionLost.bind(this)
      )

      if (!this.isConnected) {
        this.appObject.activate()
      }

      Main.panel._leftCorner.hide()
      Main.panel._rightCorner.hide()
    }

    destroy() {
      this.dockTheme.destroy()
      this._onConnectionLost()

      if (this._connectionHandlerID) {
        Gio.bus_unwatch_name(this._connectionHandlerID)
        this._connectionHandlerID = null
      }

      Main.panel._leftCorner.show()
      Main.panel._rightCorner.show()
    }
  }
)

let dashToPlank

function enable() {
  dashToPlank = new DashToPlank()
  dashToPlank.activate()
}

function disable() {
  dashToPlank.destroy()
  dashToPlank = null
}
