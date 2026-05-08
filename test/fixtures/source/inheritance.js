// Класс с @extends и @implements
goog.provide('myapp.Bar');

goog.require('myapp.Foo');
goog.require('myapp.ISerializable');

/**
 * Наследник Foo, реализующий ISerializable.
 * @constructor
 * @extends {myapp.Foo}
 * @implements {myapp.ISerializable}
 */
myapp.Bar = function() {
  myapp.Foo.call(this);
  /** @type {string} */
  this.tag = 'bar';
};
goog.inherits(myapp.Bar, myapp.Foo);

/**
 * @override
 * @return {string}
 */
myapp.Bar.prototype.getName = function() {
  return 'bar';
};

/**
 * Сериализует объект в JSON.
 * @return {string}
 */
myapp.Bar.prototype.serialize = function() {
  return JSON.stringify({ name: this.getName() });
};
