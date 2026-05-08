// Путь с query-строкой — cache-busting при отладочной загрузке
goog.addDependency('lazy/component.js?hash=abc123', ['myapp.lazy.Component'], []);
goog.addDependency('lazy/loader.js?v=2&ts=1234567890', ['myapp.lazy.Loader'], ['myapp.lazy.Component']);
