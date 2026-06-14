/* ============================================================
   RANGE SLIDER
   A small, dependency-free slider built on Pointer Events.

   Why this exists: native <input type="range" orient="vertical">
   relied on the non-standard `-webkit-appearance: slider-vertical`,
   which modern Chromium has dropped — vertical faders silently
   stopped being draggable. This component renders identically on
   every platform, supports mouse + touch + pen via Pointer Events,
   and adds DAW-style conveniences: arrow-key nudging, mouse-wheel
   adjustment, and double-click / double-tap to restore the default
   value.
   ============================================================ */

class RangeSlider {
    /**
     * @param {HTMLElement} container - element to mount the slider into
     * @param {Object} opts
     * @param {number} opts.min
     * @param {number} opts.max
     * @param {number} opts.step
     * @param {number} opts.value
     * @param {'horizontal'|'vertical'} [opts.orientation='horizontal']
     * @param {number} [opts.defaultValue] - value restored on double-click
     * @param {string} [opts.ariaLabel]
     * @param {(value: number) => void} [opts.onChange]
     */
    constructor(container, opts) {
        this.opts = Object.assign({ orientation: 'horizontal' }, opts);
        this.value = this.opts.value;
        this.decimals = this._decimalsFromStep(this.opts.step);

        const vertical = this.opts.orientation === 'vertical';

        this.el = document.createElement('div');
        this.el.className = `rs rs-${vertical ? 'vertical' : 'horizontal'}`;
        this.el.setAttribute('role', 'slider');
        this.el.setAttribute('tabindex', '0');
        this.el.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
        this.el.setAttribute('aria-valuemin', this.opts.min);
        this.el.setAttribute('aria-valuemax', this.opts.max);
        if (this.opts.ariaLabel) this.el.setAttribute('aria-label', this.opts.ariaLabel);

        this.track = document.createElement('div');
        this.track.className = 'rs-track';
        this.fill = document.createElement('div');
        this.fill.className = 'rs-fill';
        this.thumb = document.createElement('div');
        this.thumb.className = 'rs-thumb';

        this.track.appendChild(this.fill);
        this.el.appendChild(this.track);
        this.el.appendChild(this.thumb);
        container.appendChild(this.el);

        this._bindEvents();
        this.setValue(this.value, false);
    }

    _decimalsFromStep(step) {
        const s = String(step);
        const i = s.indexOf('.');
        return i === -1 ? 0 : s.length - i - 1;
    }

    _bindEvents() {
        const vertical = this.opts.orientation === 'vertical';

        const valueFromEvent = (e) => {
            const rect = this.el.getBoundingClientRect();
            let pct;
            if (vertical) {
                pct = 1 - (e.clientY - rect.top) / rect.height;
            } else {
                pct = (e.clientX - rect.left) / rect.width;
            }
            pct = Math.max(0, Math.min(1, pct));
            const raw = this.opts.min + pct * (this.opts.max - this.opts.min);
            const stepped = Math.round(raw / this.opts.step) * this.opts.step;
            return stepped;
        };

        const onPointerDown = (e) => {
            this.el.setPointerCapture(e.pointerId);
            this.el.classList.add('active');
            this.setValue(valueFromEvent(e), true);
            this.el.focus();
            e.preventDefault();
        };
        const onPointerMove = (e) => {
            if (!this.el.classList.contains('active')) return;
            this.setValue(valueFromEvent(e), true);
        };
        const onPointerUp = (e) => {
            this.el.classList.remove('active');
            if (this.el.hasPointerCapture && this.el.hasPointerCapture(e.pointerId)) {
                this.el.releasePointerCapture(e.pointerId);
            }
        };

        this.el.addEventListener('pointerdown', onPointerDown);
        this.el.addEventListener('pointermove', onPointerMove);
        this.el.addEventListener('pointerup', onPointerUp);
        this.el.addEventListener('pointercancel', onPointerUp);

        this.el.addEventListener('keydown', (e) => {
            const big = (this.opts.max - this.opts.min) / 10;
            let next = null;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowUp':
                    next = this.value + this.opts.step; break;
                case 'ArrowLeft':
                case 'ArrowDown':
                    next = this.value - this.opts.step; break;
                case 'PageUp':
                    next = this.value + big; break;
                case 'PageDown':
                    next = this.value - big; break;
                case 'Home':
                    next = this.opts.min; break;
                case 'End':
                    next = this.opts.max; break;
                default: return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.setValue(next, true);
        });

        this.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const dir = e.deltaY < 0 ? 1 : -1;
            this.setValue(this.value + dir * this.opts.step, true);
        }, { passive: false });

        this.el.addEventListener('dblclick', () => {
            if (this.opts.defaultValue !== undefined) this.setValue(this.opts.defaultValue, true);
        });
    }

    /**
     * @param {number} v
     * @param {boolean} fireChange - whether to invoke onChange + dispatch event
     */
    setValue(v, fireChange) {
        v = Math.max(this.opts.min, Math.min(this.opts.max, v));
        v = parseFloat(v.toFixed(Math.max(this.decimals, 4)));
        this.value = v;

        const pct = (v - this.opts.min) / (this.opts.max - this.opts.min) * 100;
        if (this.opts.orientation === 'vertical') {
            this.fill.style.height = pct + '%';
            this.thumb.style.bottom = pct + '%';
        } else {
            this.fill.style.width = pct + '%';
            this.thumb.style.left = pct + '%';
        }
        this.el.setAttribute('aria-valuenow', v);

        if (fireChange && typeof this.opts.onChange === 'function') {
            this.opts.onChange(v);
        }
    }
}
