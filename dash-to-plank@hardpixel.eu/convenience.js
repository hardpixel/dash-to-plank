const Gio = imports.gi.Gio
const Me  = imports.misc.extensionUtils.getCurrentExtension()

function getSettings(schema) {
  schema = schema || Me.metadata['settings-schema']

  let gioSSS       = Gio.SettingsSchemaSource
  let schemaDir    = Me.dir.get_child('schemas')
  let schemaSource = gioSSS.get_default()

  if (schemaDir.query_exists(null)) {
    schemaDir    = schemaDir.get_path()
    schemaSource = gioSSS.new_from_directory(schemaDir, schemaSource, false)
  }

  let schemaObj = schemaSource.lookup(schema, true)

  if (!schemaObj) {
    let metaId  = Me.metadata.uuid
    let message = `Schema ${schema} could not be found for extension ${metaId}.`

    throw new Error(`${message} Please check your installation.`)
  }

  return new Gio.Settings({ settings_schema: schemaObj })
}
