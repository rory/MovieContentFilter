"use strict";

function MovieContentFilter(version, fileStartTime, fileEndTime) {
	var cues = [];
	var preferences = {
		"death": null,
		"drugs": null,
		"fear": null,
		"gambling": null,
		"language": null,
		"nudity": null,
		"sex": null,
		"violence": null,
		"weapons": null
	};
	var videoLocation = null;

	this.addCue = function (startTime, endTime, category, severity, channel) {
		cues.push({
			"startTime": startTime,
			"endTime": endTime,
			"category": category,
			"severity": severity,
			"channel": channel
		});
	};

	this.getSelectedCues = function () {
		return cues.filter(function (element) {
			if (preferences.hasOwnProperty(element.category)) {
				return MovieContentFilter.isSevereEnough(element.severity, preferences[element.category]);
			}
			else {
				return true;
			}
		});
	};

	this.setPreference = function (category, requiredSeverity) {
		preferences[category] = requiredSeverity;
	};

	this.setVideoLocation = function (location) {
		videoLocation = location;
	};

	this.synchronizeCues = function (originalCues, desiredFileStartTimestamp, desiredFileEndTimestamp) {
		var timestamp;

		timestamp = MovieContentFilter.CUE_TIMESTAMP_REGEX.exec(desiredFileStartTimestamp);
		if (timestamp === null) {
			throw "Invalid start time of actual film material given";
		}
		var desiredFileStartTime = MovieContentFilter.cueTimingToSeconds(timestamp[1], timestamp[2], timestamp[3], timestamp[4]);

		timestamp = MovieContentFilter.CUE_TIMESTAMP_REGEX.exec(desiredFileEndTimestamp);
		if (timestamp === null) {
			throw "Invalid end time of actual film material given";
		}
		var desiredFileEndTime = MovieContentFilter.cueTimingToSeconds(timestamp[1], timestamp[2], timestamp[3], timestamp[4]);

		var actualLength = fileEndTime - fileStartTime;
		var desiredLength = desiredFileEndTime - desiredFileStartTime;

		var synchronizedCues = [];

		for (var i = 0; i < originalCues.length; i++) {
			originalCues[i].startTime = (originalCues[i].startTime - fileStartTime) * desiredLength / actualLength + desiredFileStartTime;
			originalCues[i].endTime = (originalCues[i].endTime - fileStartTime) * desiredLength / actualLength + desiredFileStartTime;

			synchronizedCues.push(originalCues[i]);
		}

		return synchronizedCues;
	};

	this.toXspf = function (desiredFileStartTimestamp, desiredFileEndTimestamp) {
		var lines = [];

		lines.push("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
		lines.push("<playlist version=\"1\" xmlns=\"http://xspf.org/ns/0/\" xmlns:vlc=\"http://www.videolan.org/vlc/playlist/ns/0/\">");
		lines.push("\t<trackList>");

		var selectedCues = this.getSelectedCues();

		if (selectedCues.length === 0) {
			return "";
		}

		selectedCues = MovieContentFilter.fillUpCues(selectedCues);

		selectedCues = this.synchronizeCues(selectedCues, desiredFileStartTimestamp, desiredFileEndTimestamp);

		for (var i = 0; i < selectedCues.length; i++) {
			lines.push("\t\t<track>");
			lines.push("\t\t\t<title>#"+(i + 1)+"</title>");
			lines.push("\t\t\t<location>"+videoLocation+"</location>");
			lines.push("\t\t\t<extension application=\"http://www.videolan.org/vlc/playlist/0\">");
			lines.push("\t\t\t\t<vlc:id>"+i+"</vlc:id>");
			lines.push("\t\t\t\t<vlc:option>start-time="+selectedCues[i].startTime.toFixed(3)+"</vlc:option>");
			lines.push("\t\t\t\t<vlc:option>stop-time="+selectedCues[i].endTime.toFixed(3)+"</vlc:option>");

			if (selectedCues[i].category !== null && selectedCues[i].severity !== null) {
				if (selectedCues[i].channel === "video" || selectedCues[i].channel === null) {
					lines.push("\t\t\t\t<vlc:option>no-video</vlc:option>");
				}
				if (selectedCues[i].channel === "audio" || selectedCues[i].channel === null) {
					lines.push("\t\t\t\t<vlc:option>no-audio</vlc:option>");
				}
			}

			lines.push("\t\t\t</extension>");
			lines.push("\t\t</track>");
		}

		lines.push("\t</trackList>");
		lines.push("</playlist>");
		lines.push("");

		return lines.join("\n");
	};

	this.toM3u = function (desiredFileStartTimestamp, desiredFileEndTimestamp) {
		var lines = [];
		var selectedCues = this.getSelectedCues();

		if (selectedCues.length === 0) {
			return "";
		}

		selectedCues = MovieContentFilter.fillUpCues(selectedCues);

		selectedCues = this.synchronizeCues(selectedCues, desiredFileStartTimestamp, desiredFileEndTimestamp);

		for (var i = 0; i < selectedCues.length; i++) {
			if (selectedCues[i].category === null && selectedCues[i].severity === null) {
				lines.push("#EXTVLCOPT:start-time="+selectedCues[i].startTime.toFixed(3));
				lines.push("#EXTVLCOPT:stop-time="+selectedCues[i].endTime.toFixed(3));
				lines.push(videoLocation);
			}
		}

		if (lines.length > 0) {
			lines.push("");
		}

		return lines.join("\n");
	};

	this.toEdl = function (desiredFileStartTimestamp, desiredFileEndTimestamp) {
		var lines = [];
		var selectedCues = this.getSelectedCues();

		if (selectedCues.length === 0) {
			return "";
		}

		selectedCues = MovieContentFilter.normalizeCues(selectedCues);

		selectedCues = this.synchronizeCues(selectedCues, desiredFileStartTimestamp, desiredFileEndTimestamp);

		var action;
		for (var i = 0; i < selectedCues.length; i++) {
			action = (selectedCues[i].channel === "audio") ? 1 : 0;

			lines.push(selectedCues[i].startTime.toFixed(3)+" "+selectedCues[i].endTime.toFixed(3)+" "+action);
		}

		if (lines.length > 0) {
			lines.push("");
		}

		return lines.join("\n");
	};
}

MovieContentFilter.cueTimingToSeconds = function (hourStr, minuteStr, secondStr, millisecondStr) {
	var secondsFloat = 0;

	secondsFloat += parseInt(hourStr, 10) * 3600;
	secondsFloat += parseInt(minuteStr, 10) * 60;
	secondsFloat += parseInt(secondStr, 10);
	secondsFloat += parseInt(millisecondStr, 10) / 1000;

	return secondsFloat;
};

MovieContentFilter.parseContainer = function (sourceText) {
	var container = MovieContentFilter.CONTAINER_REGEX.exec(sourceText);

	if (container === null) {
		throw "Invalid source text";
	}

	return container;
};

MovieContentFilter.parse = function (sourceText) {
	var container = MovieContentFilter.parseContainer(sourceText);

	var timestamp;

	timestamp = MovieContentFilter.CUE_TIMESTAMP_REGEX.exec(container[2]);
	if (timestamp === null) {
		throw "Invalid file start time";
	}
	var fileStartTime = MovieContentFilter.cueTimingToSeconds(timestamp[1], timestamp[2], timestamp[3], timestamp[4]);

	timestamp = MovieContentFilter.CUE_TIMESTAMP_REGEX.exec(container[3]);
	if (timestamp === null) {
		throw "Invalid file end time";
	}
	var fileEndTime = MovieContentFilter.cueTimingToSeconds(timestamp[1], timestamp[2], timestamp[3], timestamp[4]);

	var mcf = new MovieContentFilter(container[1], fileStartTime, fileEndTime);

	var cueBlock;
	while ((cueBlock = MovieContentFilter.CUE_BLOCKS_REGEX.exec(container[4])) !== null) {
		var cueComponents = cueBlock[1].split(MovieContentFilter.NEWLINE_REGEX);
		if (cueComponents !== null) {
			var cueTimings = MovieContentFilter.CUE_TIMINGS_REGEX.exec(cueComponents[0]);
			if (cueTimings !== null) {
				var cueStartTime = MovieContentFilter.cueTimingToSeconds(cueTimings[1], cueTimings[2], cueTimings[3], cueTimings[4]);
				var cueEndTime = MovieContentFilter.cueTimingToSeconds(cueTimings[5], cueTimings[6], cueTimings[7], cueTimings[8]);

				if (cueEndTime <= cueStartTime) {
					throw "End time (`"+cueEndTime+"`) must be later than start time (`"+cueStartTime+"`) in `"+cueComponents[0]+"`";
				}

				for (var i = 1; i < cueComponents.length; i++) {
					var cueProperties = cueComponents[i].split("=");

					if (cueProperties.length === 2) {
						cueProperties.push(null);
					}

					mcf.addCue(cueStartTime, cueEndTime, cueProperties[0], cueProperties[1], cueProperties[2]);
				}
			}
		}
	}

	return mcf;
};

MovieContentFilter.isSevereEnough = function (actualSeverity, requiredSeverity) {
	if (requiredSeverity === "low") {
		return actualSeverity === "low" || actualSeverity === "medium" || actualSeverity === "high";
	}
	else if (requiredSeverity === "medium") {
		return actualSeverity === "medium" || actualSeverity === "high";
	}
	else if (requiredSeverity === "high") {
		return actualSeverity === "high";
	}

	return false;
};

MovieContentFilter.normalizeCues = function (originalCues) {
	var normalizedCues = [];

	originalCues = originalCues.sort(function (a, b) {
		return a.startTime - b.startTime;
	});

	var lastCueEnd = 0;
	for (var i = 0; i < originalCues.length; i++) {
		if (originalCues[i].startTime >= lastCueEnd) {
			normalizedCues.push(originalCues[i]);
			lastCueEnd = originalCues[i].endTime;
		}
	}

	return normalizedCues;
};

MovieContentFilter.fillUpCues = function (originalCues) {
	var filledUpCues = [];

	originalCues = MovieContentFilter.normalizeCues(originalCues);

	var lastCueEnd = 0;
	for (var i = 0; i < originalCues.length; i++) {
		if (originalCues[i].startTime > lastCueEnd) {
			filledUpCues.push({
				"startTime": lastCueEnd,
				"endTime": originalCues[i].startTime,
				"category": null,
				"severity": null,
				"channel": null
			});
		}

		filledUpCues.push(originalCues[i]);

		lastCueEnd = originalCues[i].endTime;
	}

	filledUpCues.push({
		"startTime": lastCueEnd,
		"endTime": 0,
		"category": null,
		"severity": null,
		"channel": null
	});

	return filledUpCues;
};

MovieContentFilter.CONTAINER_REGEX = /^WEBVTT Movie Content Filter ([0-9]+\.[0-9]+\.[0-9]+)\r?\n\r?\nNOTE\r?\nSTART (.+?)\r?\nEND (.+?)\r?\n\r?\n([\S\s]+)$/;
MovieContentFilter.CUE_BLOCKS_REGEX = /(?:^|\r?\n\r?\n)([\s\S]+?)(?=\r?\n\r?\n|\r?\n$|$)/g;
MovieContentFilter.NEWLINE_REGEX = /\r?\n/;
MovieContentFilter.CUE_TIMESTAMP_REGEX = /^([0-9]{2,}?):([0-9]{2}?):([0-9]{2}?).([0-9]{3}?)/;
MovieContentFilter.CUE_TIMINGS_REGEX = /^([0-9]{2,}?):([0-9]{2}?):([0-9]{2}?).([0-9]{3}?) --> ([0-9]{2,}?):([0-9]{2}?):([0-9]{2}?).([0-9]{3}?)/;
