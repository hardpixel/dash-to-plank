const GLib  = imports.gi.GLib
const Gio   = imports.gi.Gio
const Main  = imports.ui.main
const Me    = imports.misc.extensionUtils.getCurrentExtension()
const Utils = Me.imports.utils

const APPS_DIR = Utils.userDataDir('applications')
const ICON_DIR = Utils.userDir('.icons/hicolor/scalable/apps')

var AppsLauncher = class AppsLauncher {
  constructor() {
    this.name = 'net.launchpad.plank.AppsLauncher'
    this.file = Utils.templatePath('apps-file.desktop')
    this.dest = GLib.build_filenamev([APPS_DIR, this.appId])
    this.icon = GLib.build_filenamev([ICON_DIR, this.iconName])
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

  get iconName() {
    return `${this.name}.svg`
  }

  install() {
    Utils.mkdir(APPS_DIR)
    Utils.mkdir(ICON_DIR)

    Utils.copyTemplate('apps-icon.svg', this.icon)
    this.keys.save_to_file(this.dest)
  }
}
