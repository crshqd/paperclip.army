(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else {
    // Browser global
    root.IPTVClient = factory().IPTVClient;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var BASE_URL = '/api/iptv/';

  var ENDPOINTS = {
    channels: 'channels.json',
    feeds: 'feeds.json',
    logos: 'logos.json',
    streams: 'streams.json',
    guides: 'guides.json',
    categories: 'categories.json',
    languages: 'languages.json',
    countries: 'countries.json',
    subdivisions: 'subdivisions.json',
    cities: 'cities.json',
    regions: 'regions.json',
    timezones: 'timezones.json',
    blocklist: 'blocklist.json'
  };

  function IPTVClient(options) {
    options = options || {};
    this.baseUrl = options.baseUrl || BASE_URL;
    this.cacheTtl = options.cacheTtl !== undefined ? options.cacheTtl : 60 * 60 * 1000; // 1 hour
    this._cache = {};    // key -> { data, expires }
    this._inflight = {}; // key -> Promise (dedupe concurrent requests)
  }

  /** Low-level fetch with caching + in-flight de-duplication */
  IPTVClient.prototype._get = function (key) {
    var self = this;
    var now = Date.now();
    var cached = this._cache[key];
    if (cached && (this.cacheTtl === 0 ? true : cached.expires > now)) {
      return Promise.resolve(cached.data);
    }
    if (this._inflight[key]) {
      return this._inflight[key];
    }

    var url = this.baseUrl + ENDPOINTS[key];
    var promise = fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('IPTVClient: failed to fetch ' + key + ' (' + res.status + ' ' + res.statusText + ')');
        }
        return res.json();
      })
      .then(function (data) {
        self._cache[key] = { data: data, expires: Date.now() + self.cacheTtl };
        delete self._inflight[key];
        return data;
      })
      .catch(function (err) {
        delete self._inflight[key];
        throw err;
      });

    this._inflight[key] = promise;
    return promise;
  };

  /** Clear all cached data (or a single resource if key is given) */
  IPTVClient.prototype.clearCache = function (key) {
    if (key) delete this._cache[key];
    else this._cache = {};
  };

  // ---- Raw resource getters (each returns the full list from the API) ----
  IPTVClient.prototype.getChannels = function () { return this._get('channels'); };
  IPTVClient.prototype.getFeeds = function () { return this._get('feeds'); };
  IPTVClient.prototype.getLogos = function () { return this._get('logos'); };
  IPTVClient.prototype.getStreams = function () { return this._get('streams'); };
  IPTVClient.prototype.getGuides = function () { return this._get('guides'); };
  IPTVClient.prototype.getCategories = function () { return this._get('categories'); };
  IPTVClient.prototype.getLanguages = function () { return this._get('languages'); };
  IPTVClient.prototype.getCountries = function () { return this._get('countries'); };
  IPTVClient.prototype.getSubdivisions = function () { return this._get('subdivisions'); };
  IPTVClient.prototype.getCities = function () { return this._get('cities'); };
  IPTVClient.prototype.getRegions = function () { return this._get('regions'); };
  IPTVClient.prototype.getTimezones = function () { return this._get('timezones'); };
  IPTVClient.prototype.getBlocklist = function () { return this._get('blocklist'); };

  // ---------------------------------------------------------------------
  // Convenience / query helpers
  // ---------------------------------------------------------------------

  /** Get a single channel by its ID (e.g. "BBCOne.uk") */
  IPTVClient.prototype.getChannelById = function (id) {
    return this.getChannels().then(function (channels) {
      for (var i = 0; i < channels.length; i++) {
        if (channels[i].id === id) return channels[i];
      }
      return null;
    });
  };

  /** Case-insensitive search across name and alt_names */
  IPTVClient.prototype.searchChannels = function (query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return Promise.resolve([]);
    return this.getChannels().then(function (channels) {
      return channels.filter(function (c) {
        var names = [c.name].concat(c.alt_names || []).filter(Boolean);
        return names.some(function (n) { return n.toLowerCase().indexOf(q) !== -1; });
      });
    });
  };

  /** All channels broadcast from a given country code (e.g. "US") */
  IPTVClient.prototype.getChannelsByCountry = function (countryCode, options) {
    var includeClosed = options && options.includeClosed;
    return this.getChannels().then(function (channels) {
      return channels.filter(function (c) {
        return c.country === countryCode && (includeClosed || !c.closed);
      });
    });
  };

  /** All channels belonging to a category ID (e.g. "news") */
  IPTVClient.prototype.getChannelsByCategory = function (categoryId, options) {
    var includeClosed = options && options.includeClosed;
    return this.getChannels().then(function (channels) {
      return channels.filter(function (c) {
        return c.categories && c.categories.indexOf(categoryId) !== -1 && (includeClosed || !c.closed);
      });
    });
  };

  /** All feeds for a given channel ID */
  IPTVClient.prototype.getFeedsForChannel = function (channelId) {
    return this.getFeeds().then(function (feeds) {
      return feeds.filter(function (f) { return f.channel === channelId; });
    });
  };

  /** All streams for a given channel ID (optionally a specific feed) */
  IPTVClient.prototype.getStreamsForChannel = function (channelId, feedId) {
    return this.getStreams().then(function (streams) {
      return streams.filter(function (s) {
        return s.channel === channelId && (feedId ? s.feed === feedId : true);
      });
    });
  };

  /** All logos for a channel, optionally filtered to only ones currently in use */
  IPTVClient.prototype.getLogosForChannel = function (channelId, options) {
    var inUseOnly = options && options.inUseOnly;
    return this.getLogos().then(function (logos) {
      return logos.filter(function (l) {
        return l.channel === channelId && (!inUseOnly || l.in_use);
      });
    });
  };

  /** The single "best" logo for a channel: prefers in-use, falls back to first available */
  IPTVClient.prototype.getLogoForChannel = function (channelId, feedId) {
    return this.getLogosForChannel(channelId).then(function (logos) {
      var scoped = feedId ? logos.filter(function (l) { return l.feed === feedId; }) : logos;
      var pool = scoped.length ? scoped : logos;
      var inUse = pool.filter(function (l) { return l.in_use; })[0];
      return inUse || pool[0] || null;
    });
  };

  /** EPG guide entries for a channel */
  IPTVClient.prototype.getGuidesForChannel = function (channelId) {
    return this.getGuides().then(function (guides) {
      return guides.filter(function (g) { return g.channel === channelId; });
    });
  };

  /** Whether a channel is blocklisted (DMCA/NSFW takedown), with the reason if so */
  IPTVClient.prototype.getBlockInfo = function (channelId) {
    return this.getBlocklist().then(function (blocklist) {
      for (var i = 0; i < blocklist.length; i++) {
        if (blocklist[i].channel === channelId) return blocklist[i];
      }
      return null;
    });
  };

  function formatStream(s) {
    return {
      title: s.title,
      url: s.url,
      feed: s.feed,
      quality: s.quality,
      referrer: s.referrer,
      userAgent: s.user_agent,
      label: s.label
    };
  }

  /**
   * Build a "playable" view of a channel: metadata + logo + streams,
   * excluding anything on the blocklist. Returns null if the channel
   * doesn't exist or is blocklisted.
   */
  IPTVClient.prototype.getPlayableChannel = function (channelId) {
    var self = this;
    return Promise.all([
      this.getChannelById(channelId),
      this.getBlockInfo(channelId)
    ]).then(function (results) {
      var channel = results[0];
      var blockInfo = results[1];
      if (!channel || blockInfo) return null;

      return Promise.all([
        self.getStreamsForChannel(channelId),
        self.getLogoForChannel(channelId)
      ]).then(function (results2) {
        var streams = results2[0];
        var logo = results2[1];
        var out = {};
        for (var k in channel) out[k] = channel[k];
        out.logo = (logo && logo.url) || null;
        out.streams = streams.map(formatStream);
        return out;
      });
    });
  };

  /**
   * Build playable views for many channels at once (e.g. a whole country or category).
   * More efficient than calling getPlayableChannel in a loop since the underlying
   * resource lists are only fetched (and cached) once.
   */
  IPTVClient.prototype.getPlayableChannels = function (channelIds) {
    return Promise.all([
      this.getStreams(),
      this.getLogos(),
      this.getBlocklist(),
      this.getChannels()
    ]).then(function (results) {
      var streams = results[0];
      var logos = results[1];
      var blocklist = results[2];
      var channels = results[3];

      var blocked = {};
      blocklist.forEach(function (b) { blocked[b.channel] = true; });

      var channelMap = {};
      channels.forEach(function (c) { channelMap[c.id] = c; });

      var result = [];
      channelIds.forEach(function (id) {
        if (blocked[id]) return;
        var channel = channelMap[id];
        if (!channel) return;

        var channelStreams = streams.filter(function (s) { return s.channel === id; });
        var channelLogos = logos.filter(function (l) { return l.channel === id; });
        var bestLogo = channelLogos.filter(function (l) { return l.in_use; })[0] || channelLogos[0] || null;

        var out = {};
        for (var k in channel) out[k] = channel[k];
        out.logo = (bestLogo && bestLogo.url) || null;
        out.streams = channelStreams.map(formatStream);
        result.push(out);
      });
      return result;
    });
  };

  return { IPTVClient: IPTVClient };

}));