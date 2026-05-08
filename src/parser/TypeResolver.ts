// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as ts from 'typescript';

const AT_TYPE_RE = /@type\s*\{([^}]+)\}/;

/**
 * Ищет @type-аннотации переменных в тексте документа через TypeScript AST.
 *
 * Покрывает GCL-паттерны:
 *   /** @type {Ns.Sub.Color} *\/ this.color_ = ...
 *   /** @type {Ns.Sub.Color} *\/ const c = ...
 *   /** @type {Ns.Sub.Color} *\/ var c = ...    (включая внутренности конструкторов и методов)
 *
 * Возвращает Map<varName, typeName>.
 * varName — имя переменной без "this." (например "color_", "c").
 */
export function resolveTypes(content: string): Map<string, string> {
  const result = new Map<string, string>();
  // setParentNodes=false — не нужны родители; getLeadingCommentRanges работает без них
  const sf = ts.createSourceFile('__type__.js', content, ts.ScriptTarget.ES5, false);

  function getTypeAnnotation(nodePos: number): string | undefined {
    const ranges = ts.getLeadingCommentRanges(content, nodePos);
    if (!ranges) return undefined;
    // Берём последний /** комментарий непосредственно перед узлом
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      const text = content.slice(r.pos, r.end);
      if (text.startsWith('/**')) {
        const m = AT_TYPE_RE.exec(text);
        if (m) return m[1].trim();
      }
    }
    return undefined;
  }

  function visitNode(node: ts.Node): void {
    // var/const/let name = ...
    if (ts.isVariableStatement(node)) {
      const typeName = getTypeAnnotation(node.pos);
      if (typeName) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            result.set(decl.name.text, typeName);
          }
        }
      }
    // this.field = ... внутри конструктора или метода
    } else if (ts.isExpressionStatement(node)) {
      const typeName = getTypeAnnotation(node.pos);
      if (typeName) {
        const expr = node.expression;
        if (
          ts.isBinaryExpression(expr) &&
          expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(expr.left) &&
          expr.left.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          result.set(expr.left.name.text, typeName);
        }
      }
    }
    // Рекурсивно обходим все дочерние узлы (тела функций, методов и т.д.)
    ts.forEachChild(node, visitNode);
  }

  ts.forEachChild(sf, visitNode);
  return result;
}
