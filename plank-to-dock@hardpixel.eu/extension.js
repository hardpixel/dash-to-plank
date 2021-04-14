const Bytes        = imports.byteArray
const GObject      = imports.gi.GObject
const Gio          = imports.gi.Gio
const GLib         = imports.gi.GLib
const Shell        = imports.gi.Shell
const Main         = imports.ui.main
const AppFavorites = imports.ui.appFavorites
const Me           = imports.misc.extensionUtils.getCurrentExtension()

const DOCK_ID = 'dock1'
const APPS_ID = 'net.launchpad.plank.AppsLauncher'

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

var PlankToDock = GObject.registerClass(
  class PlankToDock extends GObject.Object {
    _init() {
      this.favorites = AppFavorites.getAppFavorites()
      this.appSystem = Shell.AppSystem.get_default()
      this.appObject = this.lookupApp('plank.desktop')

      this.plankDbus = dbusProxy('plank', BUSNAME, BUSPATH)
      this.itemsDbus = dbusProxy('items', BUSNAME, `${BUSPATH}/${DOCK_ID}`)

      this._dashHandlerID = this.favorites.connect(
        'changed',
        this._onFavoritesChanged.bind(this)
      )

      this._dockHandlerID = this.itemsDbus.connectSignal(
        'Changed',
        this._onPersistentChanged.bind(this)
      )
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

    get appsLauncherUri() {
      const home = GLib.get_home_dir()
      const path = GLib.build_filenamev([home, '.local/share/applications', `${APPS_ID}.desktop`])

      return `file://${path}`
    }

    lookupApp(desktopId) {
      return this.appSystem.lookup_app(desktopId)
    }

    getAppUri(app) {
      return `file://${app.app_info.get_filename()}`
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

    _onFavoritesChanged() {
      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.persistentApps

        dash.forEach(uri => !dock.includes(uri) && this.addToDock(uri))
        dock.forEach(uri => !dash.includes(uri) && this.removeFromDock(uri))
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

    activate() {
      Main.panel._leftCorner.hide()
      Main.panel._rightCorner.hide()

      if (!this.isConnected) {
        this.appObject.activate()
      }

      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        if (!this.persistentApps.includes(this.appsLauncherUri)) {
          this.addToDock(this.appsLauncherUri)
        }
      })
    }

    destroy() {
      Main.panel._leftCorner.show()
      Main.panel._rightCorner.show()

      if (this._dashHandlerID) {
        this.favorites.disconnect(this._dashHandlerID)
      }

      if (this._dockHandlerID) {
        this.itemsDbus.disconnectSignal(this._dockHandlerID)
      }
    }
  }
)

function copyFile(file, dest) {
  const filePath = GLib.build_filenamev([Me.path, file])
  const fileName = GLib.path_get_basename(filePath)

  const homePath = GLib.get_home_dir()
  const destPath = GLib.build_filenamev([homePath, dest, fileName])

  if (GLib.file_test(destPath, GLib.FileTest.EXISTS)) return

  const contents = GLib.file_get_contents(filePath)

  GLib.mkdir_with_parents(GLib.path_get_dirname(destPath), parseInt('0700', 8))
  GLib.file_set_contents(destPath, Bytes.toString(contents[1]))
}

let plankToDock

function enable() {
  copyFile(`launchers/${APPS_ID}.desktop`, '.local/share/applications')
  copyFile(`launchers/${APPS_ID}.svg`, '.icons/hicolor/scalable/apps')

  copyFile('themes/horizontal/dock.theme', '.local/share/plank/themes/PlankToDock Horizontal')
  copyFile('themes/vertical/dock.theme', '.local/share/plank/themes/PlankToDock Vertical')

  plankToDock = new PlankToDock()
  plankToDock.activate()
}

function disable() {
  plankToDock.destroy()
  plankToDock = null
}
