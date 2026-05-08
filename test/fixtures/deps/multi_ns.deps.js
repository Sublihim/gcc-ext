// Один файл объявляет несколько namespace-ов (редко, но допустимо в GCL)
goog.addDependency('shared/combined.js', ['myapp.Alpha', 'myapp.Beta', 'myapp.Gamma'], ['goog.array', 'goog.object']);
