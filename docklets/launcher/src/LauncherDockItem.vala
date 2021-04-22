using Plank;

namespace DashLauncher {

  [DBus (name = "org.gnome.Shell")]
  interface Shell : Object {
    public abstract void eval(string str) throws DBusError, IOError;
    public abstract void show_applications() throws DBusError, IOError;
  }

  public class DashLauncherDockItem : DockletItem {

    public DashLauncherDockItem.with_dockitem_file(GLib.File file) {
      GLib.Object(Prefs: new DockItemPreferences.with_file(file));
    }

    construct {
      Icon = "resource://" + DashLauncher.G_RESOURCE_PATH +  "/icons/icon.svg";
      Text = "Show Applications";
    }

    protected void show_applications() {
      try {
        Shell shell = Bus.get_proxy_sync(BusType.SESSION, "org.gnome.Shell", "/org/gnome/Shell");
        shell.show_applications();
      } catch (Error e) {
        error ("Error: %s", e.message);
      }
    }

    protected void show_overview() {
      try {
        Shell shell = Bus.get_proxy_sync(BusType.SESSION, "org.gnome.Shell", "/org/gnome/Shell");
        shell.eval("Main.overview.show();");
      } catch (Error e) {
        error ("Error: %s", e.message);
      }
    }

    protected void show_preferences() {
      try {
        GLib.Process.spawn_command_line_async("plank --preferences");
      } catch (Error e) {
        error ("Error: %s", e.message);
      }
    }

    public override Gee.ArrayList<Gtk.MenuItem> get_menu_items() {
      var items = new Gee.ArrayList<Gtk.MenuItem>();

      var overview = create_menu_item("Show Overview");
      overview.activate.connect(show_overview);
      items.add(overview);

      var preferences = create_menu_item("Preferences");
      preferences.activate.connect(show_preferences);
      items.add(preferences);

      return items;
    }

    protected override AnimationType on_scrolled(Gdk.ScrollDirection direction, Gdk.ModifierType mod, uint32 event_time) {
      return AnimationType.NONE;
    }

    protected override AnimationType on_clicked(PopupButton button, Gdk.ModifierType mod, uint32 event_time) {
      if (button == PopupButton.LEFT) {
        show_applications();
      }

      return AnimationType.NONE;
    }
  }
}
