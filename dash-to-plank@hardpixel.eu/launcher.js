const GLib  = imports.gi.GLib
const Gio   = imports.gi.Gio
const Main  = imports.ui.main
const Me    = imports.misc.extensionUtils.getCurrentExtension()
const Utils = Me.imports.utils

const APPS_DIR = Utils.userPath('.local/share/applications')
const ICON_DIR = Utils.userPath('.icons/hicolor/scalable/apps')

var AppsLauncher = class AppsLauncher {
  constructor() {
    this.name = 'net.launchpad.plank.AppsLauncher'
    this.file = Utils.templatePath('apps-file.desktop')
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
    const tmplPath = Utils.templatePath('apps-icon.svg')
    const tmplFile = Gio.file_new_for_path(tmplPath)

    const destPath = GLib.build_filenamev([ICON_DIR, `${this.name}.svg`])
    const destFile = Gio.file_new_for_path(destPath)

    tmplFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null)
  }

  _copyLauncher() {
    this.keys.save_to_file(this.dest)
  }

  install() {
    Utils.mkdir(APPS_DIR)
    Utils.mkdir(ICON_DIR)

    this._copyIcon()
    this._copyLauncher()
  }
}
