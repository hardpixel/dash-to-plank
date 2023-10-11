import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

export function fileExists(path) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

export function userDir(path) {
  return GLib.build_filenamev([GLib.get_home_dir(), path])
}

export function userDataDir(path) {
  return GLib.build_filenamev([GLib.get_user_data_dir(), path])
}

export function mkdir(path) {
  if (!fileExists(path)) {
    GLib.mkdir_with_parents(path, parseInt('0700', 8))
  }
}

export function copyFile(source, destination) {
  const src  = Gio.file_new_for_path(source)
  const dest = Gio.file_new_for_path(destination)

  src.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null)
}

export function copyTemplate(filename, dest) {
  const src = templatePath(filename)
  copyFile(src, dest)
}

export function templatePath(filename) {
  const Me = Extension.lookupByURL(import.meta.url)
  return GLib.build_filenamev([Me.path, 'templates', filename])
}

export function interfacePath(filename) {
  const Me = Extension.lookupByURL(import.meta.url)
  return GLib.build_filenamev([Me.path, 'interfaces', `${filename}.xml`])
}

export function interfaceXML(filename) {
  const path = interfacePath(filename)
  const data = GLib.file_get_contents(path)

  return String.fromCharCode(...data[1])
}

export function dbusProxy(busName, busPath) {
  try {
    const DBusIFace = interfaceXML(busName)
    const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIFace)

    return new DBusProxy(Gio.DBus.session, busName, busPath)
  } catch (e) {
    return null
  }
}

export function dbusObject(busName, busPath, context) {
  const iface  = interfaceXML(busName)
  const object = Gio.DBusExportedObject.wrapJSObject(iface, context)

  object.export(Gio.DBus.session, busPath)

  return object
}

export function getPlankSettings(dock_id) {
  const schemaSource = Gio.SettingsSchemaSource.get_default()
  const schemaObj    = schemaSource.lookup('net.launchpad.plank.dock.settings', true)
  const schemaPath   = `/net/launchpad/plank/docks/${dock_id}/`

  if (schemaObj) {
    return new Gio.Settings({ settings_schema: schemaObj, path: schemaPath })
  } else {
    throw new Error('Plank schema not found. Please check your installation.')
  }
}
