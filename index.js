(function() {
"use strict";



var engine = require('./engine');
var dht = require('./dht');
var fileStream = require('./file-stream');
var parseTorrent = require('parse-torrent');
var eos = require('end-of-stream');
var util = require('util');


var handleFiles = function(pf_engine, torrent) {
	var e = pf_engine;
	e.files = torrent.files.map(function(file, i) {
		file = util._extend({index: i}, file);
		var offsetPiece = (file.offset / torrent.pieceLength) | 0;
		var endPiece = ((file.offset+file.length-1) / torrent.pieceLength) | 0;

		file.deselect = function() {
			e.deselect(offsetPiece, endPiece, false);
		};

		file.select = function() {
			e.select(offsetPiece, endPiece, false);
		};

		file.createReadStream = function(opts) {
			var stream = fileStream(e, file, opts);

			e.select(stream.startPiece, stream.endPiece, true, stream.notify.bind(stream));
			eos(stream, function() {
				e.deselect(stream.startPiece, stream.endPiece, true);
			});

			return stream;
		};

		return file;
	});
	e.emit('files-list', e.files);
};

var getMagnetTorrent = function(url) {
	url = decodeURI(url);
	var params = require('querystring').parse(url.replace(/^magnet\:\?/,''));
	var infoHash = params.xt && params.xt.indexOf('urn:btih:') === 0 && params.xt.replace('urn:btih:', '');
	if (infoHash && infoHash.length == 40) {
		return {
			infoHash: infoHash
		};
	}
};

var info_dictionaries_index = {};


var getTorrentObj = function(torrent) {
	if (typeof torrent == 'string') {
		if (torrent.match(/^magnet\:/)) {
			torrent = getMagnetTorrent(torrent);
			var torrent_with_dict = info_dictionaries_index[ torrent.infoHash ];
			if ( torrent_with_dict ) {
				torrent = util._extend(torrent, torrent_with_dict);
			}
		}
	} else {
		torrent = !Buffer.isBuffer(torrent) && typeof torrent === 'object' ? torrent : parseTorrent(torrent);
	}
	return torrent;
};

module.exports = function(torrent, opts) {
	torrent = getTorrentObj(torrent);
	
	

	var e = engine(torrent, opts);
	e.on('info-dictionary', function() {
		if ( !info_dictionaries_index[ e.torrent.infoHash ] ) {
			info_dictionaries_index[ e.torrent.infoHash ] = e.torrent;
		}

		handleFiles(e, e.torrent);

	});
	

	if (opts.dht === false) return e;

	var table = dht(torrent.infoHash);

	table.on('peer', function(addr) {
		e.connect(addr);
	});

	e.dht = table;

	return e;
};

module.exports.getTorrentObj = getTorrentObj;

})();