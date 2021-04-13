const GObject = imports.gi.GObject
const Main    = imports.ui.main
var PlankToDock = GObject.registerClass(
  class PlankToDock extends GObject.Object {
    _init() {
    }

    activate() {
      Main.panel._leftCorner.hide()
      Main.panel._rightCorner.hide()
    }

    destroy() {
      Main.panel._leftCorner.show()
      Main.panel._rightCorner.show()
    }
  }
)

let plankToDock

function enable() {
  plankToDock = new PlankToDock()
  plankToDock.activate()
}

function disable() {
  plankToDock.destroy()
  plankToDock = null
}
