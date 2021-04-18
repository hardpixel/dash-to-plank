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

const BUSNAME = 'net.launchpad.plank'
const BUSPATH = `/net/launchpad/plank/${DOCK_ID}`

function dbusProxy(busName, busPath) {
  const path = GLib.build_filenamev([Me.path, 'interfaces', `${busName}.xml`])
  const data = GLib.file_get_contents(path)

  try {
    const DBusIFace = Bytes.toString(data[1])
    const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIFace)

    return new DBusProxy(Gio.DBus.session, busName, busPath)
  } catch (e) {
    return null
  }
}

function copyTemplate(template, dest, context = {}) {
  const filePath = GLib.build_filenamev([Me.path, 'templates', template])
  const destPath = GLib.build_filenamev([GLib.get_home_dir(), dest])

  const data = GLib.file_get_contents(filePath)
  let string = Bytes.toString(data[1])

  Object.keys(context).forEach(key => {
    let re = new RegExp(`{{${key}}}`, 'g')
    string = string.replace(re, context[key])
  })

  const destDir = GLib.path_get_dirname(destPath)
  GLib.mkdir_with_parents(destDir, parseInt('0700', 8))

  GLib.file_set_contents(destPath, string)
}

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false
  return !arr1.some((val, idx) => val !== arr2[idx])
}

class PlankTheme {
  constructor(settings) {
    this.name     = 'DashToPlank'
    this.filePath = `.local/share/plank/themes/${this.name}/dock.theme`
    this.settings = settings
  }

  get iconSize() {
    return this.settings.get_int('icon-size')
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

  get offset() {
    return this.toPercent(Main.panel.height)
  }

  get paddingX() {
    if (this.vertical) {
      return this.alignment == 'fill' ? this.offset : this.toPercent(10)
    } else {
      return this.toPercent(2)
    }
  }

  get paddingY() {
    return this.toPercent(this.vertical ? 19 : 15)
  }

  get paddingB() {
    return this.position == 'top' ? this.offset + this.paddingY : this.paddingY
  }

  get itemPadding() {
    return this.toPercent(this.vertical ? 29 : 32)
  }

  toPercent(pixels) {
    return pixels * 10 / this.iconSize
  }

  _update() {
    copyTemplate('dock.theme', this.filePath, {
      paddingX:    this.paddingX.toFixed(2),
      paddingY:    this.paddingY.toFixed(2),
      paddingB:    this.paddingB.toFixed(2),
      itemPadding: this.itemPadding.toFixed(2)
    })
  }

  enable() {
    this.settings.set_string('theme', this.name)
  }

  activate() {
    this._iconHandlerID = this.settings.connect(
      'changed::icon-size',
      this._update.bind(this)
    )

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
    if (this._iconHandlerID) {
      this.settings.disconnect(this._iconHandlerID)
      this._iconHandlerID = null
    }

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

      this.plankConf = Convenience.getPlankSettings(DOCK_ID)
      this.dockTheme = new PlankTheme(this.plankConf)
      this.plankDbus = dbusProxy(BUSNAME, BUSPATH)
    }

    get isInitialized() {
      return this.settings.get_boolean('initialized')
    }

    get favoriteApps() {
      const items = this.favorites.getFavorites()
      return items.map(app => this.getAppUri(app))
    }

    get dashItems() {
      const value = global.settings.get_strv('favorite-apps')
      const items = value.map(appId => this.getAppUri(this.lookupApp(appId)))

      return items.filter(uri => !!uri)
    }

    get persistentApps() {
      const items = this.plankDbus.GetPersistentApplicationsSync()[0]
      return items.filter(uri => !uri.endsWith(`${APPS_ID}.desktop`))
    }

    get dockItems() {
      const value = this.plankConf.get_strv('dock-items')
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
      this.plankDbus.AddSync(uri)
    }

    removeFromDock(uri) {
      this.plankDbus.RemoveSync(uri)
    }

    _withLock(callback) {
      if (!this._updatesLocked) {
        this._updatesLocked = true
        try { callback() } catch {}
        this._updatesLocked = false
      }
    }

    _withPinnedOnly(callback) {
      this.plankConf.set_boolean('pinned-only', true)
      Gio.Settings.sync()

      try { callback() } catch {}
      this.plankConf.set_boolean('pinned-only', this.pinnedOnly)
    }

    _addAppsLauncher() {
      const appId = `${APPS_ID}.dockitem`
      const items = this.plankConf.get_strv('dock-items')

      if (!items.includes(appId)) {
        const home = GLib.get_home_dir()
        const apps = '.local/share/applications'
        const path = GLib.build_filenamev([home, apps, `${APPS_ID}.desktop`])

        this.addToDock(`file://${path}`)
      }
    }

    _copyAppsLauncherFiles() {
      const iconPath = `.icons/hicolor/scalable/apps/${APPS_ID}.svg`
      copyTemplate('apps-icon.svg', iconPath)

      const deskPath = `.local/share/applications/${APPS_ID}.desktop`
      copyTemplate('apps-file.desktop', deskPath)
    }

    _onInitialize() {
      if (this.isInitialized) {
        return this._addAppsLauncher()
      }

      this.dockTheme.enable()

      this._initHandlerID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        try {
          const dash = this.favoriteApps
          const dock = this.persistentApps

          this._addAppsLauncher()

          this._withPinnedOnly(() => {
            dock.forEach(uri => this.removeFromDock(uri))
            dash.forEach(uri => this.addToDock(uri))
          })

          this.settings.set_boolean('initialized', true)

          return GLib.SOURCE_REMOVE
        } catch (e) {
          return GLib.SOURCE_CONTINUE
        }
      })
    }

    _onConnectionAcquired() {
      this._onInitialize()

      this._dashHandlerID = this.favorites.connect(
        'changed',
        this._onFavoritesChanged.bind(this)
      )

      this._dockHandlerID = this.plankDbus.connectSignal(
        'Changed',
        this._onPersistentChanged.bind(this)
      )

      this._sortHandlerID = this.plankConf.connect(
        'changed::dock-items',
        this._onDockOrderChanged.bind(this)
      )
    }

    _onConnectionLost() {
      if (this._initHandlerID) {
        GLib.source_remove(this._initHandlerID)
        this._initHandlerID = null
      }

      if (this._dashHandlerID) {
        this.favorites.disconnect(this._dashHandlerID)
        this._dashHandlerID = null
      }

      if (this._dockHandlerID) {
        this.plankDbus.disconnectSignal(this._dockHandlerID)
        this._dockHandlerID = null
      }

      if (this._sortHandlerID) {
        this.plankConf.disconnect(this._sortHandlerID)
        this._sortHandlerID = null
      }
    }

    _onFavoritesChanged() {
      if (!this.isInitialized) return

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
      if (!this.isInitialized) return

      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.persistentApps

        dock.forEach(uri => !dash.includes(uri) && this.addToDash(uri))
        dash.forEach(uri => !dock.includes(uri) && this.removeFromDash(uri))
      })
    }

    _onDockOrderChanged() {
      if (!this.isInitialized) return

      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.dockItems

        dock.forEach((uri, idx) => idx != dash.indexOf(uri) && this.moveInDash(uri, idx))
      })
    }

    activate() {
      this.pinnedOnly = this.plankConf.get_boolean('pinned-only')

      this._copyAppsLauncherFiles()
      this.dockTheme.activate()

      try {
        GLib.spawn_command_line_async('plank')
      } catch (e) {
        return Main.notifyError(Me.metadata['name'], 'Plank is not available on your system.')
      }

      this._connectionHandlerID = Gio.bus_watch_name_on_connection(
        Gio.DBus.session,
        BUSNAME,
        Gio.BusNameOwnerFlags.NONE,
        this._onConnectionAcquired.bind(this),
        this._onConnectionLost.bind(this)
      )

      if (!Main.overview.showApps) {
        Main.overview.showApps = () => {
          Main.overview.show()
          Main.overview.viewSelector._showAppsButton.checked = true
        }
      }
    }

    destroy() {
      this.dockTheme.destroy()
      this._onConnectionLost()

      if (this._connectionHandlerID) {
        Gio.bus_unwatch_name(this._connectionHandlerID)
        this._connectionHandlerID = null
      }

      global.get_window_actors().forEach(({ meta_window }) => {
        if (meta_window.wm_class == 'Plank') {
          meta_window.kill()
        }
      })
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
