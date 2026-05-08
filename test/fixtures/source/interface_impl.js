// @interface + @implements в одном файле
goog.provide('myapp.ISerializable');
goog.provide('myapp.JsonSerializer');

/**
 * Интерфейс для сериализуемых объектов.
 * @interface
 */
myapp.ISerializable = function() {};

/**
 * Сериализует объект в строку.
 * @return {string}
 */
myapp.ISerializable.prototype.serialize = function() {};

/**
 * JSON-реализация ISerializable.
 * @constructor
 * @implements {myapp.ISerializable}
 */
myapp.JsonSerializer = function() {
  /** @type {Object} */
  this.data = {};
};

/**
 * @override
 * @return {string}
 */
myapp.JsonSerializer.prototype.serialize = function() {
  return JSON.stringify(this.data);
};
