const Bytes = imports.byteArray
const Gio   = imports.gi.Gio
const GLib  = imports.gi.GLib
const Me    = imports.misc.extensionUtils.getCurrentExtension()

function userPath(path) {
  return GLib.build_filenamev([GLib.get_home_dir(), path])
}

function mkdir(path) {
  GLib.mkdir_with_parents(path, parseInt('0700', 8))
}

function templatePath(filename) {
  return GLib.build_filenamev([Me.path, 'templates', filename])
}

function interfacePath(filename) {
  return GLib.build_filenamev([Me.path, 'interfaces', `${filename}.xml`])
}

function interfaceXML(filename) {
  const path = interfacePath(filename)
  const data = GLib.file_get_contents(path)

  return Bytes.toString(data[1])
}

function dbusProxy(busName, busPath) {
  try {
    const DBusIFace = interfaceXML(busName)
    const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIFace)

    return new DBusProxy(Gio.DBus.session, busName, busPath)
  } catch (e) {
    return null
  }
}
