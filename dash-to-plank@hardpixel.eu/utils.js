const Bytes = imports.byteArray
const Gio   = imports.gi.Gio
const GLib  = imports.gi.GLib
const Me    = imports.misc.extensionUtils.getCurrentExtension()

function fileExists(path) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

function userDir(path) {
  return GLib.build_filenamev([GLib.get_home_dir(), path])
}

function userDataDir(path) {
  return GLib.build_filenamev([GLib.get_user_data_dir(), path])
}

function mkdir(path) {
  if (!fileExists(path)) {
    GLib.mkdir_with_parents(path, parseInt('0700', 8))
  }
}

function copyFile(source, destination) {
  const src  = Gio.file_new_for_path(source)
  const dest = Gio.file_new_for_path(destination)

  src.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null)
}

function copyTemplate(filename, dest) {
  const src = templatePath(filename)
  copyFile(src, dest)
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
