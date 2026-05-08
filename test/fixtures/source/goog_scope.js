// Класс, обёрнутый в goog.scope
goog.provide('myapp.scoped.Widget');

goog.require('goog.dom');

goog.scope(function() {
  const dom = goog.dom;

  /**
   * Виджет с goog.scope-оберткой.
   * @constructor
   */
  myapp.scoped.Widget = function() {
    /** @type {Element} */
    this.element = dom.createElement('div');
  };

  /**
   * Отрисовывает виджет.
   * @param {Element} container
   */
  myapp.scoped.Widget.prototype.render = function(container) {
    dom.appendChild(container, this.element);
  };
});
