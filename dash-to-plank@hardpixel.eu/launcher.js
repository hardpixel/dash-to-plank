const GLib = imports.gi.GLib
const Gio  = imports.gi.Gio
const Main = imports.ui.main
const Me   = imports.misc.extensionUtils.getCurrentExtension()

const APPS_DIR  = GLib.build_filenamev([GLib.get_home_dir(), '.local/share/applications'])
const ICONS_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.icons/hicolor/scalable/apps'])

var AppsLauncher = class AppsLauncher {
  constructor() {
    this.name = 'net.launchpad.plank.AppsLauncher'
    this.file = GLib.build_filenamev([Me.path, 'templates', 'apps-file.desktop'])
    this.dest = GLib.build_filenamev([APPS_DIR, this.appId])
    this.keys = new GLib.KeyFile()

    this.keys.load_from_file(this.file, GLib.KeyFileFlags.KEEP_COMMENTS)
  }

  get appId() {
    return `${this.name}.desktop`
  }

  get uri() {
    return `file://${this.dest}`
  }

  get dockitem() {
    return `${this.name}.dockitem`
  }

  _copyIcon() {
    const tmplPath = GLib.build_filenamev([Me.path, 'templates', 'apps-icon.svg'])
    const tmplFile = Gio.file_new_for_path(tmplPath)

    const destPath = GLib.build_filenamev([ICONS_DIR, `${this.name}.svg`])
    const destFile = Gio.file_new_for_path(destPath)

    tmplFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null)
  }

  _copyLauncher() {
    this.keys.save_to_file(this.dest)
  }

  install() {
    GLib.mkdir_with_parents(APPS_DIR, parseInt('0700', 8))
    GLib.mkdir_with_parents(ICONS_DIR, parseInt('0700', 8))

    this._copyIcon()
    this._copyLauncher()
  }
}
