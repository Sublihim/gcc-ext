// Базовые goog.addDependency — provide-стиль (legacy GCL)
goog.addDependency('foo/bar.js', ['myapp.Foo'], ['goog.events.EventTarget']);
goog.addDependency('foo/baz.js', ['myapp.Baz'], ['myapp.Foo', 'goog.array']);
goog.addDependency('util/helper.js', ['myapp.util.Helper'], []);
