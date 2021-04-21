const Bytes        = imports.byteArray
const GObject      = imports.gi.GObject
const Gio          = imports.gi.Gio
const GLib         = imports.gi.GLib
const Shell        = imports.gi.Shell
const Main         = imports.ui.main
const AppFavorites = imports.ui.appFavorites
const Me           = imports.misc.extensionUtils.getCurrentExtension()
const Convenience  = Me.imports.convenience
const PlankTheme   = Me.imports.theme.PlankTheme
const AppsLauncher = Me.imports.launcher.AppsLauncher

const DOCK_ID = 'dock1'
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

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false
  return !arr1.some((val, idx) => val !== arr2[idx])
}

var DashToPlank = GObject.registerClass(
  class DashToPlank extends GObject.Object {
    _init() {
      this.settings  = Convenience.getSettings()
      this.launcher  = new AppsLauncher()
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
      return items.filter(uri => uri != this.launcher.uri)
    }

    get dockItems() {
      const value = this.plankConf.get_strv('dock-items')
      const items = value.map(item => this.getItemUri(item))

      return items.filter(uri => !!uri && uri != this.launcher.uri)
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
      const items = this.plankConf.get_strv('dock-items')

      if (!items.includes(this.launcher.dockitem)) {
        this.addToDock(this.launcher.uri)
      }
    }

    _onInitialized() {
      this._initHandlerID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        try {
          this._addAppsLauncher()
          return GLib.SOURCE_REMOVE
        } catch (e) {
          return GLib.SOURCE_CONTINUE
        }
      })
    }

    _onInitialize() {
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
      if (this.isInitialized) {
        this._onInitialized()
      } else {
        this._onInitialize()
      }

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

      this.launcher.install()
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
