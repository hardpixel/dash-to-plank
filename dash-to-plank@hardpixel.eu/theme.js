const GLib = imports.gi.GLib
const Main = imports.ui.main
const Me   = imports.misc.extensionUtils.getCurrentExtension()

const THEMES_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.local/share/plank/themes'])

var PlankTheme = class PlankTheme {
  constructor(settings) {
    this.handlers = []
    this.settings = settings

    this.name = 'DashToPlank'
    this.file = GLib.build_filenamev([Me.path, 'templates', 'dock.theme'])
    this.dest = GLib.build_filenamev([THEMES_DIR, this.name, 'dock.theme'])
    this.keys = new GLib.KeyFile()

    this.keys.load_from_file(this.file, GLib.KeyFileFlags.KEEP_COMMENTS)
  }

  enable() {
    this.settings.set_string('theme', this.name)
  }

  update() {
    const iconSize  = this.settings.get_int('icon-size')
    const position  = this.settings.get_string('position')
    const alignment = this.settings.get_string('alignment')

    const vertical  = ['left', 'right'].includes(position)
    const isPanel   = alignment == 'fill'
    const isOnTop   = position == 'top'

    const paddingX  = vertical ? (isPanel ? Main.panel.height : 10) : 2
    const paddingT  = vertical ? 19 : 15
    const paddingB  = isOnTop ? Main.panel.height + paddingT : paddingT
    const paddingI  = vertical ? 29 : 32

    const setDouble = (key, value) =>
      this.keys.set_double('PlankDockTheme', key, value * 10 / iconSize)

    setDouble('HorizPadding', paddingX)
    setDouble('TopPadding', paddingT)
    setDouble('BottomPadding', paddingB)
    setDouble('ItemPadding', paddingI)

    this.keys.save_to_file(this.dest)
  }

  activate() {
    this.handlers = [
      this.settings.connect('changed::icon-size', this.update.bind(this)),
      this.settings.connect('changed::position',  this.update.bind(this)),
      this.settings.connect('changed::alignment', this.update.bind(this))
    ]

    const themeDir = GLib.path_get_dirname(this.dest)
    GLib.mkdir_with_parents(themeDir, parseInt('0700', 8))

    this.update()
  }

  destroy() {
    this.handlers.forEach(handler => this.settings.disconnect(handler))
  }
}
