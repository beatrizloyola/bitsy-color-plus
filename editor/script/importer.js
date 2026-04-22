var pixelArtImporter = (function () {

	function getTargetSize() {
		return typeof getNewDrawingSize === 'function' ? getNewDrawingSize() : 8;
	}

	function getCurrentPaletteId() {
		var selectedRoomId = state.room;
		if (typeof roomTool !== 'undefined' && roomTool) {
			selectedRoomId = roomTool.getSelected();
		}
		if (room[selectedRoomId] === undefined) selectedRoomId = "0";
		return room[selectedRoomId].pal;
	}

	function squaredColorDistance(r1, g1, b1, r2, g2, b2) {
		var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
		return dr * dr + dg * dg + db * db;
	}

	function findOrAddPaletteColor(r, g, b, palId) {
		var palColors = getPal(palId);

		for (var i = 0; i < palColors.length; i++) {
			if (palColors[i][0] === r && palColors[i][1] === g && palColors[i][2] === b) {
				return i;
			}
		}

		if (palColors.length < 64) {
			palette[palId].colors.push([r, g, b]);
			return palette[palId].colors.length - 1;
		}

		// Palette full: map to nearest existing color (skip 0 = transparent background)
		var bestIndex = 1;
		var bestDist = Infinity;
		for (var j = 1; j < palColors.length; j++) {
			var d = squaredColorDistance(r, g, b, palColors[j][0], palColors[j][1], palColors[j][2]);
			if (d < bestDist) {
				bestDist = d;
				bestIndex = j;
			}
		}
		return bestIndex;
	}

	function countNewColors(rawImageData, targetSize, palId) {
		var palColors = getPal(palId);
		var pixels = rawImageData.data;
		var newColors = {};

		for (var i = 0; i < targetSize * targetSize; i++) {
			var idx = i * 4;
			if (pixels[idx + 3] < 128) continue;
			var r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
			var key = r + ',' + g + ',' + b;
			if (newColors[key]) continue;

			var found = false;
			for (var j = 0; j < palColors.length; j++) {
				if (palColors[j][0] === r && palColors[j][1] === g && palColors[j][2] === b) {
					found = true;
					break;
				}
			}
			if (!found) newColors[key] = true;
		}

		return Object.keys(newColors).length;
	}

	function buildDrawingData(rawImageData, targetSize, palId) {
		var pixels = rawImageData.data;
		var colorMap = {};
		var grid = [];

		for (var y = 0; y < targetSize; y++) {
			grid.push([]);
			for (var x = 0; x < targetSize; x++) {
				var i = (y * targetSize + x) * 4;
				var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];

				var palIdx;
				if (a < 128) {
					palIdx = 0; // transparent
				} else {
					var key = r + ',' + g + ',' + b;
					if (colorMap[key] !== undefined) {
						palIdx = colorMap[key];
					} else {
						palIdx = findOrAddPaletteColor(r, g, b, palId);
						colorMap[key] = palIdx;
					}
				}
				grid[y].push(palIdx);
			}
		}

		return [grid]; // single frame: imageData[frame][y][x]
	}

	function doImport(file, drawingType) {
		var targetSize = getTargetSize();
		var palId = getCurrentPaletteId();

		var reader = new FileReader();
		reader.onload = function (e) {
			var img = new Image();
			img.onload = function () {
				var offscreen = document.createElement('canvas');
				offscreen.width = targetSize;
				offscreen.height = targetSize;
				var ctx = offscreen.getContext('2d');
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(img, 0, 0, targetSize, targetSize);

				var rawData = ctx.getImageData(0, 0, targetSize, targetSize);

				var palColors = getPal(palId);
				var newColorCount = countNewColors(rawData, targetSize, palId);
				if (palColors.length + newColorCount > 64) {
					var proceed = confirm(
						localization.GetStringOrFallback("import_too_many_colors_1", "This image would add") + ' ' + newColorCount + ' ' +
						localization.GetStringOrFallback("import_too_many_colors_2", "new color(s) to the palette, but it's already at") + ' ' + palColors.length + '/64.\n\n' +
						localization.GetStringOrFallback("import_too_many_colors_ok", "OK — import anyway (extra colors mapped to nearest match)") + '\n' +
						localization.GetStringOrFallback("import_too_many_colors_cancel", "Cancel — abort import")
					);
					if (!proceed) return;
				}

				var imageData = buildDrawingData(rawData, targetSize, palId);

				if (drawingType === 'tile') {
					on_paint_tile();
				} else if (drawingType === 'sprite') {
					on_paint_sprite();
				} else if (drawingType === 'item') {
					on_paint_item();
				}

				paintTool.newDrawing(imageData);

				if (typeof paletteTool !== 'undefined' && paletteTool) {
					paletteTool.updateColorPickerUI();
					events.Raise("palette_change");
				}
			};
			img.onerror = function () {
				alert('Could not load image. Please check the file and try again.');
			};
			img.src = e.target.result;
		};
		reader.readAsDataURL(file);
	}

	return { doImport: doImport };
})();
