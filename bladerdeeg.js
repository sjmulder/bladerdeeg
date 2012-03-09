(function() {
	'use strict';

	function alertUnsupported(feature) {
		alert(
			'Your browser does not support ' + feature + '. ' +
			'Try using the latest version of Google Chrome or Firefox.');
	}

	/* utility function for Gecko which does not support 
	   event.offsetX / event.offsetY */
	function getMousePos(e) {
		if (e.offsetX) {
			return { x: e.offsetX, y: e.offsetY };
		} else if (e.layerX) {
			return { x: e.layerX, y: e.layerY };
		} else {
			alertUnsupported('local mouse coordinates');
			throw 'Cannot get mouse coordinates';
		}
	}

	var ToggleButton = function(id, title) {
		var self = this;

		registerEvent(this, 'change');
		registerEvent(this, 'select');
		registerEvent(this, 'deselect');

		var container = document.createElement('span');
		container.className = 'toggleButton';
		var checkbox = document.createElement('input');
		checkbox.id = id;
		checkbox.type = 'checkbox';
		var label = document.createElement('label');
		label.htmlFor = id;
		label.textContent = title;

		container.appendChild(checkbox);
		container.appendChild(label);

		this.id = id;
		this.checkbox = checkbox;
		this.label = label;
		this.element = container;

		checkbox.addEventListener('change', function() {
			self.emit('change', self.checkbox.checked);
		}, false);

		this.on('change', function(value) {
			if (value) {
				container.className += ' selected';
			} else {
				container.className = 
					container.className.replace(/ selected/g, '');
			}
			self.emit(value ? 'select' : 'deselect');
		});
	};

	ToggleButton.prototype = {
		get selected() {
			return this.checkbox.checked;
		},
		set selected(value) {
			this.checkbox.checked = value;
			this.emit('change', value);
			this.emit(value ? 'select' : 'deselect');
		},
		select: function() {
			this.selected = true;
		},
		deselect: function() {
			this.selected = false;
		}
	};

	var Block = function(blockElement, type) {
		var self = this;

		if (type !== 'link' && type !== 'video') {
			throw 'Unknown block type: ' + type;
		}

		registerEvent(this, 'click');
		registerEvent(this, 'save');

		var formElement = document.createElement('form');
		formElement.className = 'toolbarForm';
		var urlLabel = document.createElement('label');
		urlLabel.textContent = 
			type == 'video' ? 'MP4 file URL:' : 'Link URL:';
		var urlInput = document.createElement('input');	
		urlInput.type = 'url';
		urlInput.name = 'url';

		var autoplayLabel;
		if (type === 'video') {
			autoplayLabel = document.createElement('label');
			var autoplayInput = document.createElement('input');
			autoplayInput.type = 'checkbox';

			autoplayLabel.appendChild(autoplayInput);
			autoplayLabel.appendChild(
				document.createTextNode('Auto-play'));
		}

		urlLabel.appendChild(urlInput);
		formElement.appendChild(urlLabel);
		if (autoplayLabel) { 
			formElement.appendChild(autoplayLabel);
		}
		
		formElement.addEventListener('submit', function(e) {
			e.preventDefault();
			self.saveSettings();
		}, false);

		blockElement.addEventListener('click', function(e) {
			e.stopPropagation();
			self.emit('click');
		}, false);

		this.blockElement = blockElement;
		this.formElement = formElement;
		this.urlInput = urlInput;
		this.blockType = type;
		this.data = { url: '' };
	};

	Block.prototype = {
		saveSettings: function() {
			this.data.url = this.urlInput.value;
			this.emit('save');
		}
	};

	var BladerView = function() {
		var self = this;

		registerEvent(this, 'blockSelected');
		registerEvent(this, 'blockDeselected');

		PDFJS.disableWorker = true;

		var element = document.createElement('div');
		element.className = 'bladerView editMode';
		var toolbar = document.createElement('div');
		toolbar.className = 'toolbar';
		var caption = document.createElement('p');
		caption.className = 'caption';
		caption.textContent = 'Drop a PDF file below to begin.';
		var buttonContainer = document.createElement('div');
		buttonContainer.className = 'buttonContainer';
		buttonContainer.hidden = true;
		var linkButton = new ToggleButton('addLink', 'Link');
		var videoButton = new ToggleButton('addVideo', 'Video');
		var previewButton = new ToggleButton('preview', 'Preview');
		previewButton.element.className += ' principal';
		var pageContainer = document.createElement('div');
		pageContainer.className = 'pageContainer';
		var dropZone = document.createElement('div');
		dropZone.className = 'dropZone';
		dropZone.dropzone = 'copy';

		buttonContainer.appendChild(previewButton.element);
		buttonContainer.appendChild(linkButton.element);
		buttonContainer.appendChild(videoButton.element);
		toolbar.appendChild(caption);
		toolbar.appendChild(buttonContainer);
		element.appendChild(toolbar);
		element.appendChild(dropZone);
		element.appendChild(pageContainer);
		
		this.pdfScale = 2;
		this.element = element;
		this.pageContainer = pageContainer;
		this.caption = caption;
		this.buttonContainer = buttonContainer;
		this.dropZone = dropZone;
		this.linkButton = linkButton;
		this.videoButton = videoButton;
		this.previewButton = previewButton;
		this._insertMode = false;
		this._selectedBlock = null;

		this.blocks = [];

		dropZone.addEventListener('dragenter', function(e) {
			e.preventDefault();
		});

		dropZone.addEventListener('dragover', function(e) {
			e.dataTransfer.dropEvent = 'copy';
			e.preventDefault();
		}, false);

		dropZone.addEventListener('drop', function(e) {
			if (e.dataTransfer.files.length != 1) {
				alert('Please drop a single PDF file.');
				return;
			}
			var file = e.dataTransfer.files[0];
			if (file.type != 'application/pdf') {
				alert('Please drop a PDF file.');
				return;	
			}
			self.loadFile(file);
		}, false);

		pageContainer.addEventListener('click', function(e) {
			if (self.selectedBlock) {
				self.selectedBlock = null;
				e.stopPropagation();
			}
		}, false);

		linkButton.on('select', function() {
			self.videoButton.deselect();
			self.insertMode = true;
		});

		videoButton.on('select', function() {
			self.linkButton.deselect();	
			self.insertMode = true;
		});

		var toolDeselect = function() {
			self.insertMode = false;	
		};

		linkButton.on('deselect', toolDeselect);
		videoButton.on('deselect', toolDeselect);

		previewButton.on('change', function(selected) {
			self.insertMode = false;
			self.linkButton.deselect();
			self.videoButton.deselect();
			self.linkButton.element.hidden = selected;
			self.videoButton.element.hidden = selected;
		});

		this.on('blockSelected', function(block) {
			toolDeselect();
			buttonContainer.hidden = true;
			toolbar.appendChild(block.formElement);
			block.blockElement.className += ' selected';
		});

		this.on('blockDeselected', function(block) {
			buttonContainer.hidden = false;
			toolbar.removeChild(block.formElement);
			block.blockElement.className = 
				block.blockElement.className.replace(/selected/g);
		});
	};

	BladerView.prototype = {
		addPage: function(page) {
			var self = this;

			var pageElement = document.createElement('page');
			pageElement.className = 'page';

			var canvas = document.createElement('canvas');
			canvas.className = 'pageCanvas';
			canvas.width = page.width * this.pdfScale;
			canvas.height = page.height * this.pdfScale;

			pageElement.appendChild(canvas);
			self.pageContainer.appendChild(pageElement);

			var cancelFunc = function(e) { 
				e.preventDefault();
			};

			pageElement.addEventListener('mouseover', function() {
				document.addEventListener('selectstart', 
					cancelFunc, false);
			}, false);

			pageElement.addEventListener('mouseleave', function() {
				document.removeEventListener('selectstart', cancelFunc);
			}, false);

			pageElement.addEventListener('mousedown', function(e) {
				if (self.insertMode) {
					var mousePos = getMousePos(e);
					self.beginInsertDrag(
						pageElement, mousePos.x, mousePos.y);
				}
			}, false);

			pageElement.addEventListener('mousemove', function(e) {
				var mousePos = getMousePos(e);
				self.trackInsertDrag(mousePos.x, mousePos.y);
			}, false);

			pageElement.addEventListener('mouseup', function(e) {
				if (self.insertMode) {
					self.endInsertDrag();

					/* prevent click event */
					var clickListener = function(e2) {
						e2.preventDefault();
						e2.stopPropagation();
						pageElement.removeEventListener(
							'click', clickListener, false);
					};
					pageElement.addEventListener(
						'click', clickListener, false);
				}
			}, false);

			pageElement.addEventListener('click', function(e) {
				if (self.insertMode) {
					e.stopPropagation();
				}
			}, false);

			var context = canvas.getContext('2d');
			page.startRendering(context);
		},

		loadFile: function(file) {
			var self = this;

			this.dropZone.hidden = true;
			this.caption.hidden = true;
			this.buttonContainer.hidden = false;

			if (this.pdfReader) {
				this.pdfReader.abort();
			}
			this.pdfReader = new FileReader();
			this.pdfReader.onload = function(e) {
				var data = e.target.result;
				var pdf = new PDFJS.PDFDoc(data);

				var i;
				for (i = 0; i < pdf.numPages; i++) {
					self.addPage(pdf.getPage(i + 1));
				}
			};
			this.pdfReader.onerror = function(e) {
				alert('Error reading file.');
			};
			this.pdfReader.readAsArrayBuffer(file);
		},

		get insertMode() {
			return this._insertMode;
		},

		set insertMode(value) {
			this._insertMode = value;
			if (value) {
				this.element.className += ' insertMode';
			} else {
				this.cancelInsertDrag();
				this.element.className = 
					this.element.className.replace(/ insertMode/g, '');
			}
		},

		get selectedBlock() {
			return this._selectedBlock;
		},

		set selectedBlock(value) {
			if (this.selectedBlock) {
				this.emit('blockDeselected', this.selectedBlock);
			}
			this._selectedBlock = value;
			if (this._selectedBlock) {
				this.emit('blockSelected', value);
			}
		},

		beginInsertDrag: function(pageCanvas, x, y) {
			this.cancelInsertDrag();
			
			var insertingBlock = document.createElement('div');
			insertingBlock.className = 'block inserting';
			insertingBlock.style.left = x + 'px';
			insertingBlock.style.top = y + 'px';
			pageCanvas.appendChild(insertingBlock);

			this.insertingBlock = insertingBlock;
			this.dragStart = { x: x, y: y };
		},

		trackInsertDrag: function(x, y) {
			if (!this.insertingBlock) {
				return;
			}

			var style = this.insertingBlock.style;
			style.left   = Math.min(x, this.dragStart.x) + 'px';
			style.top    = Math.min(y, this.dragStart.y) + 'px';
			style.width  = Math.abs(x - this.dragStart.x) + 'px';
			style.height = Math.abs(y - this.dragStart.y) + 'px';
		},

		cancelInsertDrag: function() {
			if (!this.insertingBlock) {
				return;
			}

			var parent = this.insertingBlock.parentNode;
			parent.removeChild(this.insertingBlock);
			this.insertingBlock = null;
		},

		endInsertDrag: function() {
			var self = this;

			if (!this.insertingBlock) {
				return;
			}

			var blockElem = this.insertingBlock;
			var canvas = blockElem.parentNode;
			var xf = 100 / canvas.clientWidth;
			var yf = 100 / canvas.clientHeight;

			blockElem.className =
				blockElem.className.replace(/ inserting/g, '');
			blockElem.style.left   = (blockElem.offsetLeft   * xf) + '%';
			blockElem.style.width  = (blockElem.offsetWidth  * xf) + '%';
			blockElem.style.top    = (blockElem.offsetTop    * yf) + '%';
			blockElem.style.height = (blockElem.offsetHeight * yf) + '%';

			this.insertingBlock = null;

			var block = new Block(blockElem, 
				this.linkButton.selected ? 'link' : 'video');

			block.on('click', function() {
				self.selectedBlock = block;
			});

			block.on('save', function() {
				self.selectedBlock = null;
			});

			this.blocks.push(block);

			this.linkButton.deselect();
			this.videoButton.deselect();
		}
	}

	window.BladerView = BladerView;
})();