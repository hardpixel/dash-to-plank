public static void docklet_init(Plank.DockletManager manager) {
  manager.register_docklet(typeof(DashLauncher.DashLauncherDocklet));
}

namespace DashLauncher {

  public const string G_RESOURCE_PATH = "/eu/hardpixel/dash-to-plank/launcher";

  public class DashLauncherDocklet : Object, Plank.Docklet {

    public unowned string get_id() {
      return "launcher";
    }

    public unowned string get_name() {
      return "Launcher";
    }

    public unowned string get_description() {
      return "Dash to plank launcher";
    }

    public unowned string get_icon() {
      return "resource://" + DashLauncher.G_RESOURCE_PATH +  "/icons/launcher.svg";
    }

    public bool is_supported() {
      return false;
    }

    public Plank.DockElement make_element(string launcher, GLib.File file) {
      return new DashLauncherDockItem.with_dockitem_file(file);
    }
  }
}
