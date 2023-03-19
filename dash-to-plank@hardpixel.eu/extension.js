const GObject      = imports.gi.GObject
const Gio          = imports.gi.Gio
const GLib         = imports.gi.GLib
const Shell        = imports.gi.Shell
const Main         = imports.ui.main
const AppFavorites = imports.ui.appFavorites
const Me           = imports.misc.extensionUtils.getCurrentExtension()
const Utils        = Me.imports.utils
const Convenience  = Me.imports.convenience
const PlankTheme   = Me.imports.theme.PlankTheme
const AppsLauncher = Me.imports.launcher.AppsLauncher

const DOCK_ID = 'dock1'
const BUSNAME = 'net.launchpad.plank'
const BUSPATH = `/net/launchpad/plank/${DOCK_ID}`

var DashToPlank = GObject.registerClass(
  class DashToPlank extends GObject.Object {
    _init() {
      this.settings  = Convenience.getSettings()
      this.launcher  = new AppsLauncher()
      this.favorites = AppFavorites.getAppFavorites()
      this.appSystem = Shell.AppSystem.get_default()
    }

    get isInitialized() {
      return this.settings.get_boolean('initialized')
    }

    get showAppsIcon() {
      return this.settings.get_boolean('show-apps-icon')
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

    _toggleAppsLauncher() {
      const items = this.plankConf.get_strv('dock-items')
      const exist = items.includes(this.launcher.dockitem)

      if (this.showAppsIcon && !exist) {
        this.addToDock(this.launcher.uri)
      }

      if (!this.showAppsIcon && exist) {
        this.removeFromDock(this.launcher.uri)
      }
    }

    _onInitialized() {
      this._initHandlerID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        try {
          this._toggleAppsLauncher()
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

          this._toggleAppsLauncher()

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

      const equal = (a, b) =>
        a.length == b.length && !a.some((val, i) => val != b[i])

      this._withLock(() => {
        const dash = this.favoriteApps
        const dock = this.persistentApps

        if (equal(dash, dock)) return

        const head = [...dash]
        const last = head.pop()

        if (equal(head, dock)) {
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

    _onPlankStarted() {
      this.plankConf  = Convenience.getPlankSettings(DOCK_ID)
      this.dockTheme  = new PlankTheme(this.plankConf)
      this.plankDbus  = Utils.dbusProxy(BUSNAME, BUSPATH)
      this.pinnedOnly = this.plankConf.get_boolean('pinned-only')

      this.launcher.install()
      this.dockTheme.activate()

      this._connectionHandlerID = Gio.bus_watch_name_on_connection(
        Gio.DBus.session,
        BUSNAME,
        Gio.BusNameOwnerFlags.NONE,
        this._onConnectionAcquired.bind(this),
        this._onConnectionLost.bind(this)
      )

      this._showAppsHandlerID = this.settings.connect(
        'changed::show-apps-icon',
        this._toggleAppsLauncher.bind(this)
      )
    }

    activate() {
      GLib.idle_add(GLib.PRIORITY_LOW, () => {
        try {
          GLib.spawn_command_line_async('plank')
          this._onPlankStarted()
        } catch (e) {
          Main.notifyError(Me.metadata['name'], 'Plank is not available on your system.')
        }
      })
    }

    destroy() {
      this._onConnectionLost()

      if (this.dockTheme) {
        this.dockTheme.destroy()
      }

      if (this._connectionHandlerID) {
        Gio.bus_unwatch_name(this._connectionHandlerID)
        this._connectionHandlerID = null
      }

      if (this._showAppsHandlerID) {
        this.settings.disconnect(this._showAppsHandlerID)
        this._showAppsHandlerID = null
      }

      global.get_window_actors().forEach(({ meta_window }) => {
        if (meta_window.wm_class == 'Plank') {
          meta_window.kill()
        }
      })

      this.launcher.destroy()
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
