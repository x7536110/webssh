"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CompositionHelper_1 = require("./CompositionHelper");
var EventEmitter_1 = require("./EventEmitter");
var Viewport_1 = require("./Viewport");
var Clipboard_1 = require("./handlers/Clipboard");
var CircularList_1 = require("./utils/CircularList");
var EscapeSequences_1 = require("./EscapeSequences");
var InputHandler_1 = require("./InputHandler");
var Parser_1 = require("./Parser");
var Renderer_1 = require("./Renderer");
var Linkifier_1 = require("./Linkifier");
var CharMeasure_1 = require("./utils/CharMeasure");
var Browser = require("./utils/Browser");
var document = (typeof window != 'undefined') ? window.document : null;
var WRITE_BUFFER_PAUSE_THRESHOLD = 5;
var WRITE_BATCH_SIZE = 300;
var CURSOR_BLINK_INTERVAL = 600;
function Terminal(options) {
    var self = this;
    if (!(this instanceof Terminal)) {
        return new Terminal(arguments[0], arguments[1], arguments[2]);
    }
    self.browser = Browser;
    self.cancel = Terminal.cancel;
    EventEmitter_1.EventEmitter.call(this);
    if (typeof options === 'number') {
        options = {
            cols: arguments[0],
            rows: arguments[1],
            handler: arguments[2]
        };
    }
    options = options || {};
    Object.keys(Terminal.defaults).forEach(function (key) {
        if (options[key] == null) {
            options[key] = Terminal.options[key];
            if (Terminal[key] !== Terminal.defaults[key]) {
                options[key] = Terminal[key];
            }
        }
        self[key] = options[key];
    });
    if (options.colors.length === 8) {
        options.colors = options.colors.concat(Terminal._colors.slice(8));
    }
    else if (options.colors.length === 16) {
        options.colors = options.colors.concat(Terminal._colors.slice(16));
    }
    else if (options.colors.length === 10) {
        options.colors = options.colors.slice(0, -2).concat(Terminal._colors.slice(8, -2), options.colors.slice(-2));
    }
    else if (options.colors.length === 18) {
        options.colors = options.colors.concat(Terminal._colors.slice(16, -2), options.colors.slice(-2));
    }
    this.colors = options.colors;
    this.options = options;
    this.parent = options.body || options.parent || (document ? document.getElementsByTagName('body')[0] : null);
    this.cols = options.cols || options.geometry[0];
    this.rows = options.rows || options.geometry[1];
    this.geometry = [this.cols, this.rows];
    if (options.handler) {
        this.on('data', options.handler);
    }
    this.ybase = 0;
    this.ydisp = 0;
    this.x = 0;
    this.y = 0;
    this.cursorState = 0;
    this.cursorHidden = false;
    this.convertEol;
    this.queue = '';
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
    this.customKeydownHandler = null;
    this.cursorBlinkInterval = null;
    this.applicationKeypad = false;
    this.applicationCursor = false;
    this.originMode = false;
    this.insertMode = false;
    this.wraparoundMode = true;
    this.normal = null;
    this.charset = null;
    this.gcharset = null;
    this.glevel = 0;
    this.charsets = [null];
    this.decLocator;
    this.x10Mouse;
    this.vt200Mouse;
    this.vt300Mouse;
    this.normalMouse;
    this.mouseEvents;
    this.sendFocus;
    this.utfMouse;
    this.sgrMouse;
    this.urxvtMouse;
    this.element;
    this.children;
    this.refreshStart;
    this.refreshEnd;
    this.savedX;
    this.savedY;
    this.savedCols;
    this.readable = true;
    this.writable = true;
    this.defAttr = (0 << 18) | (257 << 9) | (256 << 0);
    this.curAttr = this.defAttr;
    this.params = [];
    this.currentParam = 0;
    this.prefix = '';
    this.postfix = '';
    this.inputHandler = new InputHandler_1.InputHandler(this);
    this.parser = new Parser_1.Parser(this.inputHandler, this);
    this.renderer = this.renderer || null;
    this.linkifier = this.linkifier || new Linkifier_1.Linkifier();
    this.writeBuffer = [];
    this.writeInProgress = false;
    this.xoffSentToCatchUp = false;
    this.writeStopped = false;
    this.surrogate_high = '';
    this.lines = new CircularList_1.CircularList(this.scrollback);
    var i = this.rows;
    while (i--) {
        this.lines.push(this.blankLine());
    }
    this.tabs;
    this.setupStops();
    this.userScrolling = false;
}
inherits(Terminal, EventEmitter_1.EventEmitter);
Terminal.prototype.eraseAttr = function () {
    return (this.defAttr & ~0x1ff) | (this.curAttr & 0x1ff);
};
Terminal.tangoColors = [
    '#2e3436',
    '#cc0000',
    '#4e9a06',
    '#c4a000',
    '#3465a4',
    '#75507b',
    '#06989a',
    '#d3d7cf',
    '#555753',
    '#ef2929',
    '#8ae234',
    '#fce94f',
    '#729fcf',
    '#ad7fa8',
    '#34e2e2',
    '#eeeeec'
];
Terminal.colors = (function () {
    var colors = Terminal.tangoColors.slice(), r = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff], i;
    i = 0;
    for (; i < 216; i++) {
        out(r[(i / 36) % 6 | 0], r[(i / 6) % 6 | 0], r[i % 6]);
    }
    i = 0;
    for (; i < 24; i++) {
        r = 8 + i * 10;
        out(r, r, r);
    }
    function out(r, g, b) {
        colors.push('#' + hex(r) + hex(g) + hex(b));
    }
    function hex(c) {
        c = c.toString(16);
        return c.length < 2 ? '0' + c : c;
    }
    return colors;
})();
Terminal._colors = Terminal.colors.slice();
Terminal.vcolors = (function () {
    var out = [], colors = Terminal.colors, i = 0, color;
    for (; i < 256; i++) {
        color = parseInt(colors[i].substring(1), 16);
        out.push([
            (color >> 16) & 0xff,
            (color >> 8) & 0xff,
            color & 0xff
        ]);
    }
    return out;
})();
Terminal.defaults = {
    colors: Terminal.colors,
    theme: 'default',
    convertEol: false,
    termName: 'xterm',
    geometry: [80, 24],
    cursorBlink: false,
    cursorStyle: 'block',
    visualBell: false,
    popOnBell: false,
    scrollback: 1000,
    screenKeys: false,
    debug: false,
    cancelEvents: false,
    disableStdin: false,
    useFlowControl: false,
    tabStopWidth: 8
};
Terminal.options = {};
Terminal.focus = null;
each(keys(Terminal.defaults), function (key) {
    Terminal[key] = Terminal.defaults[key];
    Terminal.options[key] = Terminal.defaults[key];
});
Terminal.prototype.focus = function () {
    return this.textarea.focus();
};
Terminal.prototype.getOption = function (key, value) {
    if (!(key in Terminal.defaults)) {
        throw new Error('No option with key "' + key + '"');
    }
    if (typeof this.options[key] !== 'undefined') {
        return this.options[key];
    }
    return this[key];
};
Terminal.prototype.setOption = function (key, value) {
    if (!(key in Terminal.defaults)) {
        throw new Error('No option with key "' + key + '"');
    }
    switch (key) {
        case 'scrollback':
            if (this.options[key] !== value) {
                if (this.lines.length > value) {
                    var amountToTrim = this.lines.length - value;
                    var needsRefresh = (this.ydisp - amountToTrim < 0);
                    this.lines.trimStart(amountToTrim);
                    this.ybase = Math.max(this.ybase - amountToTrim, 0);
                    this.ydisp = Math.max(this.ydisp - amountToTrim, 0);
                    if (needsRefresh) {
                        this.refresh(0, this.rows - 1);
                    }
                }
                this.lines.maxLength = value;
                this.viewport.syncScrollArea();
            }
            break;
    }
    this[key] = value;
    this.options[key] = value;
    switch (key) {
        case 'cursorBlink':
            this.setCursorBlinking(value);
            break;
        case 'cursorStyle':
            this.element.classList.toggle("xterm-cursor-style-underline", value === 'underline');
            this.element.classList.toggle("xterm-cursor-style-bar", value === 'bar');
            break;
        case 'tabStopWidth':
            this.setupStops();
            break;
    }
};
Terminal.prototype.restartCursorBlinking = function () {
    this.setCursorBlinking(this.options.cursorBlink);
};
Terminal.prototype.setCursorBlinking = function (enabled) {
    this.element.classList.toggle('xterm-cursor-blink', enabled);
    this.clearCursorBlinkingInterval();
    if (enabled) {
        var self = this;
        this.cursorBlinkInterval = setInterval(function () {
            self.element.classList.toggle('xterm-cursor-blink-on');
        }, CURSOR_BLINK_INTERVAL);
    }
};
Terminal.prototype.clearCursorBlinkingInterval = function () {
    this.element.classList.remove('xterm-cursor-blink-on');
    if (this.cursorBlinkInterval) {
        clearInterval(this.cursorBlinkInterval);
        this.cursorBlinkInterval = null;
    }
};
Terminal.bindFocus = function (term) {
    on(term.textarea, 'focus', function (ev) {
        if (term.sendFocus) {
            term.send(EscapeSequences_1.C0.ESC + '[I');
        }
        term.element.classList.add('focus');
        term.showCursor();
        term.restartCursorBlinking.apply(term);
        Terminal.focus = term;
        term.emit('focus', { terminal: term });
    });
};
Terminal.prototype.blur = function () {
    return this.textarea.blur();
};
Terminal.bindBlur = function (term) {
    on(term.textarea, 'blur', function (ev) {
        term.refresh(term.y, term.y);
        if (term.sendFocus) {
            term.send(EscapeSequences_1.C0.ESC + '[O');
        }
        term.element.classList.remove('focus');
        term.clearCursorBlinkingInterval.apply(term);
        Terminal.focus = null;
        term.emit('blur', { terminal: term });
    });
};
Terminal.prototype.initGlobal = function () {
    var term = this;
    Terminal.bindKeys(this);
    Terminal.bindFocus(this);
    Terminal.bindBlur(this);
    on(this.element, 'copy', function (ev) {
        Clipboard_1.copyHandler.call(this, ev, term);
    });
    on(this.textarea, 'paste', function (ev) {
        Clipboard_1.pasteHandler.call(this, ev, term);
    });
    on(this.element, 'paste', function (ev) {
        Clipboard_1.pasteHandler.call(this, ev, term);
    });
    function rightClickHandlerWrapper(ev) {
        Clipboard_1.rightClickHandler.call(this, ev, term);
    }
    if (term.browser.isFirefox) {
        on(this.element, 'mousedown', function (ev) {
            if (ev.button == 2) {
                rightClickHandlerWrapper(ev);
            }
        });
    }
    else {
        on(this.element, 'contextmenu', rightClickHandlerWrapper);
    }
};
Terminal.bindKeys = function (term) {
    on(term.element, 'keydown', function (ev) {
        if (document.activeElement != this) {
            return;
        }
        term.keyDown(ev);
    }, true);
    on(term.element, 'keypress', function (ev) {
        if (document.activeElement != this) {
            return;
        }
        term.keyPress(ev);
    }, true);
    on(term.element, 'keyup', function (ev) {
        if (!wasMondifierKeyOnlyEvent(ev)) {
            term.focus(term);
        }
    }, true);
    on(term.textarea, 'keydown', function (ev) {
        term.keyDown(ev);
    }, true);
    on(term.textarea, 'keypress', function (ev) {
        term.keyPress(ev);
        this.value = '';
    }, true);
    on(term.textarea, 'compositionstart', term.compositionHelper.compositionstart.bind(term.compositionHelper));
    on(term.textarea, 'compositionupdate', term.compositionHelper.compositionupdate.bind(term.compositionHelper));
    on(term.textarea, 'compositionend', term.compositionHelper.compositionend.bind(term.compositionHelper));
    term.on('refresh', term.compositionHelper.updateCompositionElements.bind(term.compositionHelper));
    term.on('refresh', function (data) {
        term.queueLinkification(data.start, data.end);
    });
};
Terminal.prototype.insertRow = function (row) {
    if (typeof row != 'object') {
        row = document.createElement('div');
    }
    this.rowContainer.appendChild(row);
    this.children.push(row);
    return row;
};
Terminal.prototype.open = function (parent, focus) {
    var self = this, i = 0, div;
    this.parent = parent || this.parent;
    if (!this.parent) {
        throw new Error('Terminal requires a parent element.');
    }
    this.context = this.parent.ownerDocument.defaultView;
    this.document = this.parent.ownerDocument;
    this.body = this.document.getElementsByTagName('body')[0];
    this.element = this.document.createElement('div');
    this.element.classList.add('terminal');
    this.element.classList.add('xterm');
    this.element.classList.add('xterm-theme-' + this.theme);
    this.setCursorBlinking(this.options.cursorBlink);
    this.element.style.height;
    this.element.setAttribute('tabindex', 0);
    this.viewportElement = document.createElement('div');
    this.viewportElement.classList.add('xterm-viewport');
    this.element.appendChild(this.viewportElement);
    this.viewportScrollArea = document.createElement('div');
    this.viewportScrollArea.classList.add('xterm-scroll-area');
    this.viewportElement.appendChild(this.viewportScrollArea);
    this.rowContainer = document.createElement('div');
    this.rowContainer.classList.add('xterm-rows');
    this.element.appendChild(this.rowContainer);
    this.children = [];
    this.linkifier.attachToDom(document, this.children);
    this.helperContainer = document.createElement('div');
    this.helperContainer.classList.add('xterm-helpers');
    this.element.appendChild(this.helperContainer);
    this.textarea = document.createElement('textarea');
    this.textarea.classList.add('xterm-helper-textarea');
    this.textarea.setAttribute('autocorrect', 'off');
    this.textarea.setAttribute('autocapitalize', 'off');
    this.textarea.setAttribute('spellcheck', 'false');
    this.textarea.tabIndex = 0;
    this.textarea.addEventListener('focus', function () {
        self.emit('focus', { terminal: self });
    });
    this.textarea.addEventListener('blur', function () {
        self.emit('blur', { terminal: self });
    });
    this.helperContainer.appendChild(this.textarea);
    this.compositionView = document.createElement('div');
    this.compositionView.classList.add('composition-view');
    this.compositionHelper = new CompositionHelper_1.CompositionHelper(this.textarea, this.compositionView, this);
    this.helperContainer.appendChild(this.compositionView);
    this.charSizeStyleElement = document.createElement('style');
    this.helperContainer.appendChild(this.charSizeStyleElement);
    for (; i < this.rows; i++) {
        this.insertRow();
    }
    this.parent.appendChild(this.element);
    this.charMeasure = new CharMeasure_1.CharMeasure(document, this.helperContainer);
    this.charMeasure.on('charsizechanged', function () {
        self.updateCharSizeCSS();
    });
    this.charMeasure.measure();
    this.viewport = new Viewport_1.Viewport(this, this.viewportElement, this.viewportScrollArea, this.charMeasure);
    this.renderer = new Renderer_1.Renderer(this);
    this.refresh(0, this.rows - 1);
    this.initGlobal();
    if (typeof focus == 'undefined') {
        var message = 'You did not pass the `focus` argument in `Terminal.prototype.open()`.\n';
        message += 'The `focus` argument now defaults to `true` but starting with xterm.js 3.0 ';
        message += 'it will default to `false`.';
        console.warn(message);
        focus = true;
    }
    if (focus) {
        this.focus();
    }
    on(this.element, 'click', function () {
        var selection = document.getSelection(), collapsed = selection.isCollapsed, isRange = typeof collapsed == 'boolean' ? !collapsed : selection.type == 'Range';
        if (!isRange) {
            self.focus();
        }
    });
    this.bindMouse();
    this.emit('open');
};
Terminal.loadAddon = function (addon, callback) {
    if (typeof exports === 'object' && typeof module === 'object') {
        return require('./addons/' + addon + '/' + addon);
    }
    else if (typeof define == 'function') {
        return require(['./addons/' + addon + '/' + addon], callback);
    }
    else {
        console.error('Cannot load a module without a CommonJS or RequireJS environment.');
        return false;
    }
};
Terminal.prototype.updateCharSizeCSS = function () {
    this.charSizeStyleElement.textContent = '.xterm-wide-char{width:' + (this.charMeasure.width * 2) + 'px;}';
};
Terminal.prototype.bindMouse = function () {
    var el = this.element, self = this, pressed = 32;
    function sendButton(ev) {
        var button, pos;
        button = getButton(ev);
        pos = getCoords(ev);
        if (!pos)
            return;
        sendEvent(button, pos);
        switch (ev.overrideType || ev.type) {
            case 'mousedown':
                pressed = button;
                break;
            case 'mouseup':
                pressed = 32;
                break;
            case 'wheel':
                break;
        }
    }
    function sendMove(ev) {
        var button = pressed, pos;
        pos = getCoords(ev);
        if (!pos)
            return;
        button += 32;
        sendEvent(button, pos);
    }
    function encode(data, ch) {
        if (!self.utfMouse) {
            if (ch === 255)
                return data.push(0);
            if (ch > 127)
                ch = 127;
            data.push(ch);
        }
        else {
            if (ch === 2047)
                return data.push(0);
            if (ch < 127) {
                data.push(ch);
            }
            else {
                if (ch > 2047)
                    ch = 2047;
                data.push(0xC0 | (ch >> 6));
                data.push(0x80 | (ch & 0x3F));
            }
        }
    }
    function sendEvent(button, pos) {
        if (self.vt300Mouse) {
            button &= 3;
            pos.x -= 32;
            pos.y -= 32;
            var data = EscapeSequences_1.C0.ESC + '[24';
            if (button === 0)
                data += '1';
            else if (button === 1)
                data += '3';
            else if (button === 2)
                data += '5';
            else if (button === 3)
                return;
            else
                data += '0';
            data += '~[' + pos.x + ',' + pos.y + ']\r';
            self.send(data);
            return;
        }
        if (self.decLocator) {
            button &= 3;
            pos.x -= 32;
            pos.y -= 32;
            if (button === 0)
                button = 2;
            else if (button === 1)
                button = 4;
            else if (button === 2)
                button = 6;
            else if (button === 3)
                button = 3;
            self.send(EscapeSequences_1.C0.ESC + '['
                + button
                + ';'
                + (button === 3 ? 4 : 0)
                + ';'
                + pos.y
                + ';'
                + pos.x
                + ';'
                + (pos.page || 0)
                + '&w');
            return;
        }
        if (self.urxvtMouse) {
            pos.x -= 32;
            pos.y -= 32;
            pos.x++;
            pos.y++;
            self.send(EscapeSequences_1.C0.ESC + '[' + button + ';' + pos.x + ';' + pos.y + 'M');
            return;
        }
        if (self.sgrMouse) {
            pos.x -= 32;
            pos.y -= 32;
            self.send(EscapeSequences_1.C0.ESC + '[<'
                + (((button & 3) === 3 ? button & ~3 : button) - 32)
                + ';'
                + pos.x
                + ';'
                + pos.y
                + ((button & 3) === 3 ? 'm' : 'M'));
            return;
        }
        var data = [];
        encode(data, button);
        encode(data, pos.x);
        encode(data, pos.y);
        self.send(EscapeSequences_1.C0.ESC + '[M' + String.fromCharCode.apply(String, data));
    }
    function getButton(ev) {
        var button, shift, meta, ctrl, mod;
        switch (ev.overrideType || ev.type) {
            case 'mousedown':
                button = ev.button != null
                    ? +ev.button
                    : ev.which != null
                        ? ev.which - 1
                        : null;
                if (self.browser.isMSIE) {
                    button = button === 1 ? 0 : button === 4 ? 1 : button;
                }
                break;
            case 'mouseup':
                button = 3;
                break;
            case 'DOMMouseScroll':
                button = ev.detail < 0
                    ? 64
                    : 65;
                break;
            case 'wheel':
                button = ev.wheelDeltaY > 0
                    ? 64
                    : 65;
                break;
        }
        shift = ev.shiftKey ? 4 : 0;
        meta = ev.metaKey ? 8 : 0;
        ctrl = ev.ctrlKey ? 16 : 0;
        mod = shift | meta | ctrl;
        if (self.vt200Mouse) {
            mod &= ctrl;
        }
        else if (!self.normalMouse) {
            mod = 0;
        }
        button = (32 + (mod << 2)) + button;
        return button;
    }
    function getCoords(ev) {
        var x, y, w, h, el;
        if (ev.pageX == null)
            return;
        x = ev.pageX;
        y = ev.pageY;
        el = self.element;
        while (el && el !== self.document.documentElement) {
            x -= el.offsetLeft;
            y -= el.offsetTop;
            el = 'offsetParent' in el
                ? el.offsetParent
                : el.parentNode;
        }
        x = Math.ceil(x / self.charMeasure.width);
        y = Math.ceil(y / self.charMeasure.height);
        if (x < 0)
            x = 0;
        if (x > self.cols)
            x = self.cols;
        if (y < 0)
            y = 0;
        if (y > self.rows)
            y = self.rows;
        x += 32;
        y += 32;
        return {
            x: x,
            y: y,
            type: 'wheel'
        };
    }
    on(el, 'mousedown', function (ev) {
        if (!self.mouseEvents)
            return;
        sendButton(ev);
        self.focus();
        if (self.vt200Mouse) {
            ev.overrideType = 'mouseup';
            sendButton(ev);
            return self.cancel(ev);
        }
        if (self.normalMouse)
            on(self.document, 'mousemove', sendMove);
        if (!self.x10Mouse) {
            on(self.document, 'mouseup', function up(ev) {
                sendButton(ev);
                if (self.normalMouse)
                    off(self.document, 'mousemove', sendMove);
                off(self.document, 'mouseup', up);
                return self.cancel(ev);
            });
        }
        return self.cancel(ev);
    });
    on(el, 'wheel', function (ev) {
        if (!self.mouseEvents)
            return;
        if (self.x10Mouse
            || self.vt300Mouse
            || self.decLocator)
            return;
        sendButton(ev);
        return self.cancel(ev);
    });
    on(el, 'wheel', function (ev) {
        if (self.mouseEvents)
            return;
        self.viewport.onWheel(ev);
        return self.cancel(ev);
    });
};
Terminal.prototype.destroy = function () {
    this.readable = false;
    this.writable = false;
    this._events = {};
    this.handler = function () { };
    this.write = function () { };
    if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }
};
Terminal.prototype.refresh = function (start, end) {
    if (this.renderer) {
        this.renderer.queueRefresh(start, end);
    }
};
Terminal.prototype.queueLinkification = function (start, end) {
    if (this.linkifier) {
        for (var i = start; i <= end; i++) {
            this.linkifier.linkifyRow(i);
        }
    }
};
Terminal.prototype.showCursor = function () {
    if (!this.cursorState) {
        this.cursorState = 1;
        this.refresh(this.y, this.y);
    }
};
Terminal.prototype.scroll = function () {
    var row;
    if (this.lines.length === this.lines.maxLength) {
        this.lines.trimStart(1);
        this.ybase--;
        if (this.ydisp !== 0) {
            this.ydisp--;
        }
    }
    this.ybase++;
    if (!this.userScrolling) {
        this.ydisp = this.ybase;
    }
    row = this.ybase + this.rows - 1;
    row -= this.rows - 1 - this.scrollBottom;
    if (row === this.lines.length) {
        this.lines.push(this.blankLine());
    }
    else {
        this.lines.splice(row, 0, this.blankLine());
    }
    if (this.scrollTop !== 0) {
        if (this.ybase !== 0) {
            this.ybase--;
            if (!this.userScrolling) {
                this.ydisp = this.ybase;
            }
        }
        this.lines.splice(this.ybase + this.scrollTop, 1);
    }
    this.updateRange(this.scrollTop);
    this.updateRange(this.scrollBottom);
    this.emit('scroll', this.ydisp);
};
Terminal.prototype.scrollDisp = function (disp, suppressScrollEvent) {
    if (disp < 0) {
        this.userScrolling = true;
    }
    else if (disp + this.ydisp >= this.ybase) {
        this.userScrolling = false;
    }
    this.ydisp += disp;
    if (this.ydisp > this.ybase) {
        this.ydisp = this.ybase;
    }
    else if (this.ydisp < 0) {
        this.ydisp = 0;
    }
    if (!suppressScrollEvent) {
        this.emit('scroll', this.ydisp);
    }
    this.refresh(0, this.rows - 1);
};
Terminal.prototype.scrollPages = function (pageCount) {
    this.scrollDisp(pageCount * (this.rows - 1));
};
Terminal.prototype.scrollToTop = function () {
    this.scrollDisp(-this.ydisp);
};
Terminal.prototype.scrollToBottom = function () {
    this.scrollDisp(this.ybase - this.ydisp);
};
Terminal.prototype.write = function (data) {
    this.writeBuffer.push(data);
    if (this.options.useFlowControl && !this.xoffSentToCatchUp && this.writeBuffer.length >= WRITE_BUFFER_PAUSE_THRESHOLD) {
        this.send(EscapeSequences_1.C0.DC3);
        this.xoffSentToCatchUp = true;
    }
    if (!this.writeInProgress && this.writeBuffer.length > 0) {
        this.writeInProgress = true;
        var self = this;
        setTimeout(function () {
            self.innerWrite();
        });
    }
};
Terminal.prototype.innerWrite = function () {
    var writeBatch = this.writeBuffer.splice(0, WRITE_BATCH_SIZE);
    while (writeBatch.length > 0) {
        var data = writeBatch.shift();
        var l = data.length, i = 0, j, cs, ch, code, low, ch_width, row;
        if (this.xoffSentToCatchUp && writeBatch.length === 0 && this.writeBuffer.length === 0) {
            this.send(EscapeSequences_1.C0.DC1);
            this.xoffSentToCatchUp = false;
        }
        this.refreshStart = this.y;
        this.refreshEnd = this.y;
        this.parser.parse(data);
        this.updateRange(this.y);
        this.refresh(this.refreshStart, this.refreshEnd);
    }
    if (this.writeBuffer.length > 0) {
        var self = this;
        setTimeout(function () {
            self.innerWrite();
        }, 0);
    }
    else {
        this.writeInProgress = false;
    }
};
Terminal.prototype.writeln = function (data) {
    this.write(data + '\r\n');
};
Terminal.prototype.attachCustomKeydownHandler = function (customKeydownHandler) {
    this.customKeydownHandler = customKeydownHandler;
};
Terminal.prototype.setHypertextLinkHandler = function (handler) {
    if (!this.linkifier) {
        throw new Error('Cannot attach a hypertext link handler before Terminal.open is called');
    }
    this.linkifier.setHypertextLinkHandler(handler);
    this.refresh(0, this.rows - 1);
};
Terminal.prototype.setHypertextValidationCallback = function (handler) {
    if (!this.linkifier) {
        throw new Error('Cannot attach a hypertext validation callback before Terminal.open is called');
    }
    this.linkifier.setHypertextValidationCallback(handler);
    this.refresh(0, this.rows - 1);
};
Terminal.prototype.registerLinkMatcher = function (regex, handler, options) {
    if (this.linkifier) {
        var matcherId = this.linkifier.registerLinkMatcher(regex, handler, options);
        this.refresh(0, this.rows - 1);
        return matcherId;
    }
};
Terminal.prototype.deregisterLinkMatcher = function (matcherId) {
    if (this.linkifier) {
        if (this.linkifier.deregisterLinkMatcher(matcherId)) {
            this.refresh(0, this.rows - 1);
        }
    }
};
Terminal.prototype.keyDown = function (ev) {
    if (this.customKeydownHandler && this.customKeydownHandler(ev) === false) {
        return false;
    }
    this.restartCursorBlinking();
    if (!this.compositionHelper.keydown.bind(this.compositionHelper)(ev)) {
        if (this.ybase !== this.ydisp) {
            this.scrollToBottom();
        }
        return false;
    }
    var self = this;
    var result = this.evaluateKeyEscapeSequence(ev);
    if (result.key === EscapeSequences_1.C0.DC3) {
        this.writeStopped = true;
    }
    else if (result.key === EscapeSequences_1.C0.DC1) {
        this.writeStopped = false;
    }
    if (result.scrollDisp) {
        this.scrollDisp(result.scrollDisp);
        return this.cancel(ev, true);
    }
    if (isThirdLevelShift(this, ev)) {
        return true;
    }
    if (result.cancel) {
        this.cancel(ev, true);
    }
    if (!result.key) {
        return true;
    }
    this.emit('keydown', ev);
    this.emit('key', result.key, ev);
    this.showCursor();
    this.handler(result.key);
    return this.cancel(ev, true);
};
Terminal.prototype.evaluateKeyEscapeSequence = function (ev) {
    var result = {
        cancel: false,
        key: undefined,
        scrollDisp: undefined
    };
    var modifiers = ev.shiftKey << 0 | ev.altKey << 1 | ev.ctrlKey << 2 | ev.metaKey << 3;
    switch (ev.keyCode) {
        case 8:
            if (ev.shiftKey) {
                result.key = EscapeSequences_1.C0.BS;
                break;
            }
            result.key = EscapeSequences_1.C0.DEL;
            break;
        case 9:
            if (ev.shiftKey) {
                result.key = EscapeSequences_1.C0.ESC + '[Z';
                break;
            }
            result.key = EscapeSequences_1.C0.HT;
            result.cancel = true;
            break;
        case 13:
            result.key = EscapeSequences_1.C0.CR;
            result.cancel = true;
            break;
        case 27:
            result.key = EscapeSequences_1.C0.ESC;
            result.cancel = true;
            break;
        case 37:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'D';
                if (result.key == EscapeSequences_1.C0.ESC + '[1;3D') {
                    result.key = (this.browser.isMac) ? EscapeSequences_1.C0.ESC + 'b' : EscapeSequences_1.C0.ESC + '[1;5D';
                }
            }
            else if (this.applicationCursor) {
                result.key = EscapeSequences_1.C0.ESC + 'OD';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[D';
            }
            break;
        case 39:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'C';
                if (result.key == EscapeSequences_1.C0.ESC + '[1;3C') {
                    result.key = (this.browser.isMac) ? EscapeSequences_1.C0.ESC + 'f' : EscapeSequences_1.C0.ESC + '[1;5C';
                }
            }
            else if (this.applicationCursor) {
                result.key = EscapeSequences_1.C0.ESC + 'OC';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[C';
            }
            break;
        case 38:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'A';
                if (result.key == EscapeSequences_1.C0.ESC + '[1;3A') {
                    result.key = EscapeSequences_1.C0.ESC + '[1;5A';
                }
            }
            else if (this.applicationCursor) {
                result.key = EscapeSequences_1.C0.ESC + 'OA';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[A';
            }
            break;
        case 40:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'B';
                if (result.key == EscapeSequences_1.C0.ESC + '[1;3B') {
                    result.key = EscapeSequences_1.C0.ESC + '[1;5B';
                }
            }
            else if (this.applicationCursor) {
                result.key = EscapeSequences_1.C0.ESC + 'OB';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[B';
            }
            break;
        case 45:
            if (!ev.shiftKey && !ev.ctrlKey) {
                result.key = EscapeSequences_1.C0.ESC + '[2~';
            }
            break;
        case 46:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[3;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[3~';
            }
            break;
        case 36:
            if (modifiers)
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'H';
            else if (this.applicationCursor)
                result.key = EscapeSequences_1.C0.ESC + 'OH';
            else
                result.key = EscapeSequences_1.C0.ESC + '[H';
            break;
        case 35:
            if (modifiers)
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'F';
            else if (this.applicationCursor)
                result.key = EscapeSequences_1.C0.ESC + 'OF';
            else
                result.key = EscapeSequences_1.C0.ESC + '[F';
            break;
        case 33:
            if (ev.shiftKey) {
                result.scrollDisp = -(this.rows - 1);
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[5~';
            }
            break;
        case 34:
            if (ev.shiftKey) {
                result.scrollDisp = this.rows - 1;
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[6~';
            }
            break;
        case 112:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'P';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + 'OP';
            }
            break;
        case 113:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'Q';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + 'OQ';
            }
            break;
        case 114:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'R';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + 'OR';
            }
            break;
        case 115:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[1;' + (modifiers + 1) + 'S';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + 'OS';
            }
            break;
        case 116:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[15;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[15~';
            }
            break;
        case 117:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[17;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[17~';
            }
            break;
        case 118:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[18;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[18~';
            }
            break;
        case 119:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[19;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[19~';
            }
            break;
        case 120:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[20;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[20~';
            }
            break;
        case 121:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[21;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[21~';
            }
            break;
        case 122:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[23;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[23~';
            }
            break;
        case 123:
            if (modifiers) {
                result.key = EscapeSequences_1.C0.ESC + '[24;' + (modifiers + 1) + '~';
            }
            else {
                result.key = EscapeSequences_1.C0.ESC + '[24~';
            }
            break;
        default:
            if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
                if (ev.keyCode >= 65 && ev.keyCode <= 90) {
                    result.key = String.fromCharCode(ev.keyCode - 64);
                }
                else if (ev.keyCode === 32) {
                    result.key = String.fromCharCode(0);
                }
                else if (ev.keyCode >= 51 && ev.keyCode <= 55) {
                    result.key = String.fromCharCode(ev.keyCode - 51 + 27);
                }
                else if (ev.keyCode === 56) {
                    result.key = String.fromCharCode(127);
                }
                else if (ev.keyCode === 219) {
                    result.key = String.fromCharCode(27);
                }
                else if (ev.keyCode === 220) {
                    result.key = String.fromCharCode(28);
                }
                else if (ev.keyCode === 221) {
                    result.key = String.fromCharCode(29);
                }
            }
            else if (!this.browser.isMac && ev.altKey && !ev.ctrlKey && !ev.metaKey) {
                if (ev.keyCode >= 65 && ev.keyCode <= 90) {
                    result.key = EscapeSequences_1.C0.ESC + String.fromCharCode(ev.keyCode + 32);
                }
                else if (ev.keyCode === 192) {
                    result.key = EscapeSequences_1.C0.ESC + '`';
                }
                else if (ev.keyCode >= 48 && ev.keyCode <= 57) {
                    result.key = EscapeSequences_1.C0.ESC + (ev.keyCode - 48);
                }
            }
            break;
    }
    return result;
};
Terminal.prototype.setgLevel = function (g) {
    this.glevel = g;
    this.charset = this.charsets[g];
};
Terminal.prototype.setgCharset = function (g, charset) {
    this.charsets[g] = charset;
    if (this.glevel === g) {
        this.charset = charset;
    }
};
Terminal.prototype.keyPress = function (ev) {
    var key;
    this.cancel(ev);
    if (ev.charCode) {
        key = ev.charCode;
    }
    else if (ev.which == null) {
        key = ev.keyCode;
    }
    else if (ev.which !== 0 && ev.charCode !== 0) {
        key = ev.which;
    }
    else {
        return false;
    }
    if (!key || ((ev.altKey || ev.ctrlKey || ev.metaKey) && !isThirdLevelShift(this, ev))) {
        return false;
    }
    key = String.fromCharCode(key);
    this.emit('keypress', key, ev);
    this.emit('key', key, ev);
    this.showCursor();
    this.handler(key);
    return false;
};
Terminal.prototype.send = function (data) {
    var self = this;
    if (!this.queue) {
        setTimeout(function () {
            self.handler(self.queue);
            self.queue = '';
        }, 1);
    }
    this.queue += data;
};
Terminal.prototype.bell = function () {
    if (!this.visualBell)
        return;
    var self = this;
    this.element.style.borderColor = 'white';
    setTimeout(function () {
        self.element.style.borderColor = '';
    }, 10);
    if (this.popOnBell)
        this.focus();
};
Terminal.prototype.log = function () {
    if (!this.debug)
        return;
    if (!this.context.console || !this.context.console.log)
        return;
    var args = Array.prototype.slice.call(arguments);
    this.context.console.log.apply(this.context.console, args);
};
Terminal.prototype.error = function () {
    if (!this.debug)
        return;
    if (!this.context.console || !this.context.console.error)
        return;
    var args = Array.prototype.slice.call(arguments);
    this.context.console.error.apply(this.context.console, args);
};
Terminal.prototype.resize = function (x, y) {
    if (isNaN(x) || isNaN(y)) {
        return;
    }
    var line, el, i, j, ch, addToY;
    if (x === this.cols && y === this.rows) {
        return;
    }
    if (x < 1)
        x = 1;
    if (y < 1)
        y = 1;
    j = this.cols;
    if (j < x) {
        ch = [this.defAttr, ' ', 1];
        i = this.lines.length;
        while (i--) {
            while (this.lines.get(i).length < x) {
                this.lines.get(i).push(ch);
            }
        }
    }
    this.cols = x;
    this.setupStops(this.cols);
    j = this.rows;
    addToY = 0;
    if (j < y) {
        el = this.element;
        while (j++ < y) {
            if (this.lines.length < y + this.ybase) {
                if (this.ybase > 0 && this.lines.length <= this.ybase + this.y + addToY + 1) {
                    this.ybase--;
                    addToY++;
                    if (this.ydisp > 0) {
                        this.ydisp--;
                    }
                }
                else {
                    this.lines.push(this.blankLine());
                }
            }
            if (this.children.length < y) {
                this.insertRow();
            }
        }
    }
    else {
        while (j-- > y) {
            if (this.lines.length > y + this.ybase) {
                if (this.lines.length > this.ybase + this.y + 1) {
                    this.lines.pop();
                }
                else {
                    this.ybase++;
                    this.ydisp++;
                }
            }
            if (this.children.length > y) {
                el = this.children.shift();
                if (!el)
                    continue;
                el.parentNode.removeChild(el);
            }
        }
    }
    this.rows = y;
    if (this.y >= y) {
        this.y = y - 1;
    }
    if (addToY) {
        this.y += addToY;
    }
    if (this.x >= x) {
        this.x = x - 1;
    }
    this.scrollTop = 0;
    this.scrollBottom = y - 1;
    this.charMeasure.measure();
    this.refresh(0, this.rows - 1);
    this.normal = null;
    this.geometry = [this.cols, this.rows];
    this.emit('resize', { terminal: this, cols: x, rows: y });
};
Terminal.prototype.updateRange = function (y) {
    if (y < this.refreshStart)
        this.refreshStart = y;
    if (y > this.refreshEnd)
        this.refreshEnd = y;
};
Terminal.prototype.maxRange = function () {
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
};
Terminal.prototype.setupStops = function (i) {
    if (i != null) {
        if (!this.tabs[i]) {
            i = this.prevStop(i);
        }
    }
    else {
        this.tabs = {};
        i = 0;
    }
    for (; i < this.cols; i += this.getOption('tabStopWidth')) {
        this.tabs[i] = true;
    }
};
Terminal.prototype.prevStop = function (x) {
    if (x == null)
        x = this.x;
    while (!this.tabs[--x] && x > 0)
        ;
    return x >= this.cols
        ? this.cols - 1
        : x < 0 ? 0 : x;
};
Terminal.prototype.nextStop = function (x) {
    if (x == null)
        x = this.x;
    while (!this.tabs[++x] && x < this.cols)
        ;
    return x >= this.cols
        ? this.cols - 1
        : x < 0 ? 0 : x;
};
Terminal.prototype.eraseRight = function (x, y) {
    var line = this.lines.get(this.ybase + y);
    if (!line) {
        return;
    }
    var ch = [this.eraseAttr(), ' ', 1];
    for (; x < this.cols; x++) {
        line[x] = ch;
    }
    this.updateRange(y);
};
Terminal.prototype.eraseLeft = function (x, y) {
    var line = this.lines.get(this.ybase + y);
    if (!line) {
        return;
    }
    var ch = [this.eraseAttr(), ' ', 1];
    x++;
    while (x--) {
        line[x] = ch;
    }
    this.updateRange(y);
};
Terminal.prototype.clear = function () {
    if (this.ybase === 0 && this.y === 0) {
        return;
    }
    this.lines.set(0, this.lines.get(this.ybase + this.y));
    this.lines.length = 1;
    this.ydisp = 0;
    this.ybase = 0;
    this.y = 0;
    for (var i = 1; i < this.rows; i++) {
        this.lines.push(this.blankLine());
    }
    this.refresh(0, this.rows - 1);
    this.emit('scroll', this.ydisp);
};
Terminal.prototype.eraseLine = function (y) {
    this.eraseRight(0, y);
};
Terminal.prototype.blankLine = function (cur) {
    var attr = cur
        ? this.eraseAttr()
        : this.defAttr;
    var ch = [attr, ' ', 1], line = [], i = 0;
    for (; i < this.cols; i++) {
        line[i] = ch;
    }
    return line;
};
Terminal.prototype.ch = function (cur) {
    return cur
        ? [this.eraseAttr(), ' ', 1]
        : [this.defAttr, ' ', 1];
};
Terminal.prototype.is = function (term) {
    var name = this.termName;
    return (name + '').indexOf(term) === 0;
};
Terminal.prototype.handler = function (data) {
    if (this.options.disableStdin) {
        return;
    }
    if (this.ybase !== this.ydisp) {
        this.scrollToBottom();
    }
    this.emit('data', data);
};
Terminal.prototype.handleTitle = function (title) {
    this.emit('title', title);
};
Terminal.prototype.index = function () {
    this.y++;
    if (this.y > this.scrollBottom) {
        this.y--;
        this.scroll();
    }
    if (this.x >= this.cols) {
        this.x--;
    }
};
Terminal.prototype.reverseIndex = function () {
    var j;
    if (this.y === this.scrollTop) {
        this.lines.shiftElements(this.y + this.ybase, this.rows - 1, 1);
        this.lines.set(this.y + this.ybase, this.blankLine(true));
        this.updateRange(this.scrollTop);
        this.updateRange(this.scrollBottom);
    }
    else {
        this.y--;
    }
};
Terminal.prototype.reset = function () {
    this.options.rows = this.rows;
    this.options.cols = this.cols;
    var customKeydownHandler = this.customKeydownHandler;
    var cursorBlinkInterval = this.cursorBlinkInterval;
    Terminal.call(this, this.options);
    this.customKeydownHandler = customKeydownHandler;
    this.cursorBlinkInterval = cursorBlinkInterval;
    this.refresh(0, this.rows - 1);
    this.viewport.syncScrollArea();
};
Terminal.prototype.tabSet = function () {
    this.tabs[this.x] = true;
};
function on(el, type, handler, capture) {
    if (!Array.isArray(el)) {
        el = [el];
    }
    el.forEach(function (element) {
        element.addEventListener(type, handler, capture || false);
    });
}
function off(el, type, handler, capture) {
    el.removeEventListener(type, handler, capture || false);
}
function cancel(ev, force) {
    if (!this.cancelEvents && !force) {
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    return false;
}
function inherits(child, parent) {
    function f() {
        this.constructor = child;
    }
    f.prototype = parent.prototype;
    child.prototype = new f;
}
function indexOf(obj, el) {
    var i = obj.length;
    while (i--) {
        if (obj[i] === el)
            return i;
    }
    return -1;
}
function isThirdLevelShift(term, ev) {
    var thirdLevelKey = (term.browser.isMac && ev.altKey && !ev.ctrlKey && !ev.metaKey) ||
        (term.browser.isMSWindows && ev.altKey && ev.ctrlKey && !ev.metaKey);
    if (ev.type == 'keypress') {
        return thirdLevelKey;
    }
    return thirdLevelKey && (!ev.keyCode || ev.keyCode > 47);
}
Terminal.prototype.matchColor = matchColor;
function matchColor(r1, g1, b1) {
    var hash = (r1 << 16) | (g1 << 8) | b1;
    if (matchColor._cache[hash] != null) {
        return matchColor._cache[hash];
    }
    var ldiff = Infinity, li = -1, i = 0, c, r2, g2, b2, diff;
    for (; i < Terminal.vcolors.length; i++) {
        c = Terminal.vcolors[i];
        r2 = c[0];
        g2 = c[1];
        b2 = c[2];
        diff = matchColor.distance(r1, g1, b1, r2, g2, b2);
        if (diff === 0) {
            li = i;
            break;
        }
        if (diff < ldiff) {
            ldiff = diff;
            li = i;
        }
    }
    return matchColor._cache[hash] = li;
}
matchColor._cache = {};
matchColor.distance = function (r1, g1, b1, r2, g2, b2) {
    return Math.pow(30 * (r1 - r2), 2)
        + Math.pow(59 * (g1 - g2), 2)
        + Math.pow(11 * (b1 - b2), 2);
};
function each(obj, iter, con) {
    if (obj.forEach)
        return obj.forEach(iter, con);
    for (var i = 0; i < obj.length; i++) {
        iter.call(con, obj[i], i, obj);
    }
}
function wasMondifierKeyOnlyEvent(ev) {
    return ev.keyCode === 16 ||
        ev.keyCode === 17 ||
        ev.keyCode === 18;
}
function keys(obj) {
    if (Object.keys)
        return Object.keys(obj);
    var key, keys = [];
    for (key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            keys.push(key);
        }
    }
    return keys;
}
Terminal.EventEmitter = EventEmitter_1.EventEmitter;
Terminal.inherits = inherits;
Terminal.on = on;
Terminal.off = off;
Terminal.cancel = cancel;
module.exports = Terminal;

//# sourceMappingURL=xterm.js.map
