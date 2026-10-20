/* Song Studio catalog — register songs and load song data in browser or Node. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SongCatalog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ENTRIES = [
    {
      id: "sunrise-redline",
      title: "Sunrise Redline",
      songType: "melodic-metal",
      load: function () {
        if (typeof module === "object" && module.exports) {
          return require("./songs/sunrise-redline.js");
        }
        var bag = root.SamSongData || {};
        return bag["sunrise-redline"];
      }
    },
    {
      id: "sams-neo-classical",
      title: "Sam's Neo-Classical",
      songType: "neo-classical",
      load: function () {
        if (typeof module === "object" && module.exports) {
          return require("./songs/sams-neo-classical.js");
        }
        var bag = root.SamSongData || {};
        return bag["sams-neo-classical"];
      }
    }
  ];

  function byId(id) {
    for (var i = 0; i < ENTRIES.length; i++) {
      if (ENTRIES[i].id === id) return ENTRIES[i];
    }
    return null;
  }

  return {
    defaultSongId: "sunrise-redline",
    list: function () {
      return ENTRIES.map(function (e) {
        return { id: e.id, title: e.title, songType: e.songType };
      });
    },
    load: function (id) {
      var entry = byId(id || "sunrise-redline");
      if (!entry) throw new Error("Unknown song id: " + id);
      var data = entry.load();
      if (!data) throw new Error("Song data not loaded for: " + id);
      return data;
    }
  };
});
