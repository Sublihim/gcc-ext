// Базовый класс в GCL provide-стиле: @constructor, @extends, прототипный и статический методы
goog.provide('myapp.Foo');

goog.require('goog.events.EventTarget');
goog.require('myapp.TypesEnum');

/**
 * Базовый класс Foo.
 * @constructor
 * @extends {goog.events.EventTarget}
 */
myapp.Foo = function() {
  goog.base(this);

  /**
   * @type {myapp.TypesEnum}
   * @private
   */
  this.type_ = myapp.TypesEnum.Type_1;  
};
goog.inherits(myapp.Foo, goog.events.EventTarget);

/**
 * Возвращает имя объекта.
 * @return {string} имя
 */
myapp.Foo.prototype.getName = function() {
  return 'foo';
};

/**
 * Вспомогательная статическая функция.
 * @param {number} x входное значение
 * @return {number}
 */
myapp.Foo.staticHelper = function(x) {
  return x * 2;
};

/** @return {myapp.TypesEnum} */
myapp.Foo.prototype.getType = function() {
  return this.type_;
};
