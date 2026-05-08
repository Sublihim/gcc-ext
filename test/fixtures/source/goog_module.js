// goog.module стиль с exports
goog.module('myapp.module.Thing');

/**
 * Вещь в goog.module-стиле.
 * @constructor
 */
const Thing = function() {
  /** @type {string} */
  this.name = 'thing';
};

/**
 * Выполняет некоторое действие.
 * @return {string}
 */
Thing.prototype.doSomething = function() {
  return 'something';
};

/**
 * Статический фабричный метод.
 * @return {!Thing}
 */
Thing.create = function() {
  return new Thing();
};

exports = Thing;
