// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Category filter for Dash.
 *
 * @module     local_dash/category_mega_filter
 * @copyright  2026 bdecent gmbh <https://bdecent.de>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], (function() {

    var delegated = false;

    var SELECTOR = {
        wrap: '.dash-cat-mega-wrap',
        label: '.dash-cat-label',
        megaCol: '.dash-mega-col',
        hiddenSel: '.dash-cat-hidden-select',
        drawer: '.dash-cat-drawer',
        drawerPanel: '.dash-cat-drawer-panel',
        drawerClose: '.dash-cat-drawer-close',
        mobileOpen: '.dash-cat-mobile-open',
        mobileList: '.dash-mobile-list',
        mobileTitle: '.dash-mobile-title',
        mobileBack: '.dash-mobile-back',
        clearBtn: '.dash-cat-clear',
    };

    /**
     * Get the category tree stored on a wrap element.
     *
     * @param {HTMLElement} wrap
     * @return {Array}
     */
    function getTree(wrap) {
        try {
            return JSON.parse(wrap.dataset.tree) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Render a list of category nodes into a desktop column.
     *
     * @param {HTMLElement} wrap
     * @param {HTMLUListElement} ul
     * @param {HTMLElement} colEl
     * @param {Array} items
     * @param {number} level
     */
    /**
     * Return the column element at `idx` within wrap, creating it if it does not exist yet.
     *
     * @param {HTMLElement} wrap
     * @param {number} idx  Zero-based column index.
     * @return {HTMLElement}
     */
    function ensureColumn(wrap, idx) {
        var cols = wrap.querySelectorAll(SELECTOR.megaCol);
        if (idx < cols.length) {
            return cols[idx];
        }
        var container = wrap.querySelector('.dash-mega-cols');
        var col = document.createElement('div');
        col.className = 'dash-mega-col dash-mega-col--empty';
        col.dataset.level = String(idx + 1);
        var colUl = document.createElement('ul');
        colUl.className = 'list-unstyled m-0 p-0';
        colUl.setAttribute('role', 'menu');
        col.appendChild(colUl);
        container.appendChild(col);
        return col;
    }

    function buildColumn(wrap, ul, colEl, items, level) {
        ul.innerHTML = '';

        if (!items || items.length === 0) {
            colEl.classList.add('dash-mega-col--empty');
            return;
        }
        colEl.classList.remove('dash-mega-col--empty');

        items.forEach(function(cat) {
            var li = document.createElement('li');
            li.setAttribute('role', 'menuitem');
            li.dataset.catId = cat.id;

            var span = document.createElement('span');
            span.className = 'dash-cat-item-name';
            span.textContent = cat.name;
            li.appendChild(span);

            if (cat.has_children) {
                var chev = document.createElement('span');
                chev.className = 'dash-cat-chevron';
                chev.setAttribute('aria-hidden', 'true');
                chev.textContent = '›';
                li.appendChild(chev);
            }

            li.addEventListener('mouseenter', function() {
                ul.querySelectorAll('li').forEach(function(s) { s.classList.remove('active'); });
                li.classList.add('active');
                var nextColIdx = level;
                var nextCol = ensureColumn(wrap, nextColIdx);
                buildColumn(wrap, nextCol.querySelector('ul'), nextCol, cat.children || [], level + 1);
                // Clear any columns that exist beyond this one.
                var cols = wrap.querySelectorAll(SELECTOR.megaCol);
                for (var i = nextColIdx + 1; i < cols.length; i++) {
                    buildColumn(wrap, cols[i].querySelector('ul'), cols[i], [], i + 1);
                }
            });

            li.addEventListener('click', function(e) {
                e.stopPropagation();
                applyFilter(wrap, cat.id, cat.name);
                closeDropdown(wrap);
            });

            ul.appendChild(li);
        });
    }

    /**
     * Build the desktop columns from the tree stored on the wrap.
     *
     * @param {HTMLElement} wrap
     */
    function buildDesktopColumns(wrap) {
        var tree = getTree(wrap);
        var cols = wrap.querySelectorAll(SELECTOR.megaCol);
        if (cols.length >= 1) {
            buildColumn(wrap, cols[0].querySelector('ul'), cols[0], tree, 1);
            for (var i = 1; i < cols.length; i++) {
                buildColumn(wrap, cols[i].querySelector('ul'), cols[i], [], i + 1);
            }
        }
    }

    /**
     * Close the Bootstrap dropdown inside this wrap.
     *
     * @param {HTMLElement} wrap
     */
    function closeDropdown(wrap) {
        var btn = wrap.querySelector('[data-bs-toggle="dropdown"]');
        if (btn && window.bootstrap && window.bootstrap.Dropdown) {
            var inst = window.bootstrap.Dropdown.getInstance(btn);
            if (inst) {
                inst.hide();
            }
        }
    }

    /**
     * Open the custom drawer for the given wrap.
     * Resets title, back button, and rebuilds the root list.
     *
     * @param {HTMLElement} wrap
     */
    function openDrawer(wrap) {
        var drawerEl = wrap.querySelector(SELECTOR.drawer);
        if (!drawerEl) {
            return;
        }

        // Reset header state.
        var titleEl = wrap.querySelector(SELECTOR.mobileTitle);
        var labelEl = wrap.querySelector(SELECTOR.label);
        if (titleEl && labelEl) {
            titleEl.textContent = labelEl.dataset.defaultLabel
                || wrap.dataset.labelall
                || labelEl.textContent;
        }
        var backBtn = wrap.querySelector(SELECTOR.mobileBack);
        if (backBtn) {
            backBtn.style.display = 'none';
        }

        // Fresh navigation stack for this open session.
        var stack = [];
        drawerEl._dashStack = stack;
        buildMobileList(wrap, getTree(wrap), stack);

        // Show: add class then lock body scroll.
        drawerEl.setAttribute('aria-hidden', 'false');
        drawerEl.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the custom drawer for the given wrap.
     *
     * @param {HTMLElement} wrap
     * @param {Function}    [callback]
     */
    function closeDrawer(wrap, callback) {
        var drawerEl = wrap.querySelector(SELECTOR.drawer);
        if (!drawerEl || !drawerEl.classList.contains('show')) {
            // Already closed or missing.
            if (callback) {
                callback();
            }
            return;
        }

        drawerEl.classList.remove('show');
        drawerEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        if (!callback) {
            return;
        }

        // Wait for the panel slide-out transition before calling back.
        var panel = drawerEl.querySelector(SELECTOR.drawerPanel);
        if (!panel) {
            callback();
            return;
        }

        var fired = false;
        var finish = function() {
            if (fired) {
                return;
            }
            fired = true;
            panel.removeEventListener('transitionend', finish);
            callback();
        };
        panel.addEventListener('transitionend', finish);
        setTimeout(finish, 400);
    }

    /**
     * Render categories into the mobile list.
     *
     * @param {HTMLElement} wrap
     * @param {Array}       items
     * @param {Array}       stack  Navigation history for the back button.
     */
    function buildMobileList(wrap, items, stack) {
        var ul = wrap.querySelector(SELECTOR.mobileList);
        ul.innerHTML = '';

        items.forEach(function(cat) {
            var li = document.createElement('li');
            li.setAttribute('role', 'menuitem');
            li.dataset.catId = cat.id;

            var span = document.createElement('span');
            span.textContent = cat.name;
            li.appendChild(span);

            if (cat.has_children) {
                var chev = document.createElement('span');
                chev.className = 'dash-cat-chevron';
                chev.setAttribute('aria-hidden', 'true');
                chev.textContent = '›';
                li.appendChild(chev);
            }

            li.addEventListener('click', function() {
                requestCloseAndFilter(wrap, cat.id, cat.name);
            });

            // Tapping the chevron drills into children (parents only).
            if (cat.has_children) {
                chev.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var titleEl = wrap.querySelector(SELECTOR.mobileTitle);
                    stack.push({items: items, title: titleEl ? titleEl.textContent : ''});
                    if (titleEl) {
                        titleEl.textContent = cat.name;
                    }
                    var backBtn = wrap.querySelector(SELECTOR.mobileBack);
                    if (backBtn) {
                        backBtn.style.display = '';
                    }
                    buildMobileList(wrap, cat.children || [], stack);
                });
            }

            ul.appendChild(li);
        });
    }

    /**
     * Close the drawer, then apply the category filter.
     *
     * @param {HTMLElement} wrap
     * @param {number}      catId
     * @param {string}      catName
     */
    function requestCloseAndFilter(wrap, catId, catName) {
        closeDrawer(wrap, function() {
            applyFilter(wrap, catId, catName);
        });
    }

    /**
     * Apply the selected category filter: update labels, hidden select, and trigger change.
     *
     * @param {HTMLElement} wrap
     * @param {number}      catId
     * @param {string}      catName
     */
    function applyFilter(wrap, catId, catName) {
        wrap.querySelectorAll(SELECTOR.label).forEach(function(el) {
            if (!el.dataset.defaultLabel) {
                el.dataset.defaultLabel = el.textContent;
            }
            el.textContent = catName;
        });

        var sel = wrap.querySelector(SELECTOR.hiddenSel);
        if (sel) {
            Array.from(sel.options).forEach(function(opt) {
                opt.selected = (parseInt(opt.value, 10) === parseInt(catId, 10));
            });
            sel.dispatchEvent(new Event('change', {bubbles: true}));
        }

        // Show clear button when a real category (not ALL_OPTION) is selected.
        wrap.querySelectorAll(SELECTOR.clearBtn).forEach(function(btn) {
            btn.style.display = (parseInt(catId, 10) === -1) ? 'none' : '';
        });
    }

    /**
     * Reset the category filter to "All" and restore the default label.
     *
     * @param {HTMLElement} wrap
     */
    function clearFilter(wrap) {
        // Restore label to default.
        wrap.querySelectorAll(SELECTOR.label).forEach(function(el) {
            var def = el.dataset.defaultLabel || wrap.dataset.labelall;
            if (def) {
                el.textContent = def;
            }
        });

        var sel = wrap.querySelector(SELECTOR.hiddenSel);
        if (sel) {
            Array.from(sel.options).forEach(function(opt) {
                opt.selected = (parseInt(opt.value, 10) === -1);
            });
            sel.dispatchEvent(new Event('change', {bubbles: true}));
        }

        // Hide clear button.
        wrap.querySelectorAll(SELECTOR.clearBtn).forEach(function(btn) {
            btn.style.display = 'none';
        });
    }

    /**
     * Set up event delegation for all current and future category mega filter instances.
     */
    function initDelegatedEvents() {
        document.addEventListener('show.bs.dropdown', function(e) {
            var wrap = e.target.closest(SELECTOR.wrap);
            if (wrap) {
                buildDesktopColumns(wrap);
            }
        });

        document.addEventListener('click', function(e) {
            var btn = e.target.closest(SELECTOR.mobileOpen);
            if (!btn) {
                return;
            }
            var wrap = btn.closest(SELECTOR.wrap);
            if (wrap) {
                openDrawer(wrap);
            }
        });

        document.addEventListener('click', function(e) {
            var clearBtn = e.target.closest(SELECTOR.clearBtn);
            if (clearBtn) {
                e.stopPropagation();
                var wrap = clearBtn.closest(SELECTOR.wrap);
                if (wrap) {
                    clearFilter(wrap);
                }
                return;
            }

            var closeBtn = e.target.closest(SELECTOR.drawerClose);
            if (closeBtn) {
                var wrap = closeBtn.closest(SELECTOR.wrap);
                if (wrap) {
                    closeDrawer(wrap);
                }
                return;
            }

            if (e.target.classList.contains('dash-cat-drawer')) {
                var wrap = e.target.closest(SELECTOR.wrap);
                if (wrap) {
                    closeDrawer(wrap);
                }
                return;
            }

            // Back button: pop the navigation stack.
            var backBtn = e.target.closest(SELECTOR.mobileBack);
            if (backBtn) {
                var wrap = backBtn.closest(SELECTOR.wrap);
                if (!wrap) {
                    return;
                }
                var drawerEl = wrap.querySelector(SELECTOR.drawer);
                var stack = drawerEl ? (drawerEl._dashStack || []) : [];
                if (stack.length === 0) {
                    return;
                }
                var prev = stack.pop();
                var titleEl = wrap.querySelector(SELECTOR.mobileTitle);
                if (titleEl) {
                    titleEl.textContent = prev.title;
                }
                if (stack.length === 0) {
                    backBtn.style.display = 'none';
                }
                buildMobileList(wrap, prev.items, stack);
            }
        });
    }

    return {
        init: function() {
            if (!delegated) {
                initDelegatedEvents();
                delegated = true;
            }
            // Show clear button for any wrap that already has a non-All selection on load.
            document.querySelectorAll(SELECTOR.wrap).forEach(function(wrap) {
                var sel = wrap.querySelector(SELECTOR.hiddenSel);
                if (!sel) {
                    return;
                }
                var hasActiveFilter = Array.from(sel.options).some(function(opt) {
                    return opt.selected && parseInt(opt.value, 10) !== -1;
                });
                if (hasActiveFilter) {
                    wrap.querySelectorAll(SELECTOR.clearBtn).forEach(function(btn) {
                        btn.style.display = '';
                    });
                }
            });
        }
    };
}));
