PRG = libdocklet-launcher.so
CC = gcc
VALAC = valac
PKGCONFIG = $(shell which pkg-config)
PACKAGES = gtk+-3.0 plank
CFLAGS = `$(PKGCONFIG) --cflags $(PACKAGES)`
LIBS = `$(PKGCONFIG) --libs $(PACKAGES)`
VALAFLAGS = $(patsubst %, --pkg %, $(PACKAGES)) -X -fPIC -X -shared --library=$(PRG)

SOURCES = src/LauncherDocklet.vala\
		src/LauncherDockItem.vala

UIFILES =

.SUFFIXES:

.PHONY: all clean distclean

all: $(PRG)
$(PRG): $(SOURCES) $(UIFILES)
	glib-compile-resources launcher.gresource.xml --target=resources.c --generate-source
	$(VALAC) -o $(PRG) $(SOURCES) resources.c $(VALAFLAGS)

install:
	install -D $(PRG) ../../dash-to-plank@hardpixel.eu/docklets/$(PRG)

clean:
	rm -f $(PRG)

distclean: clean
	rm -f *.vala.c
