/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {test} from 'uvu';
import {compileTsFragment, CompilerHostCache} from './compile-ts-fragment.js';
import * as ts from 'typescript';
import * as assert from 'uvu/assert';
import * as prettier from 'prettier';
import constructorCleanupTransformer from '../constructor-cleanup.js';

const cache = new CompilerHostCache();

/**
 * Compile the given fragment of TypeScript source code using
 * constructorCleanupTransformer. Check that there are no errors and that the
 * output matches (prettier-formatted).
 */
function checkTransform(inputTs: string, expectedJs: string) {
  const options = ts.getDefaultCompilerOptions();
  options.target = ts.ScriptTarget.ESNext;
  options.module = ts.ModuleKind.ESNext;
  // Don't automatically load typings from nodes_modules/@types, we're not using
  // them here, so it's a waste of time.
  options.typeRoots = [];
  const result = compileTsFragment(inputTs, __dirname, options, cache, () => ({
    after: [constructorCleanupTransformer()],
  }));

  let formattedExpected = prettier.format(expectedJs, {parser: 'typescript'});
  // TypeScript >= 4 will add an empty export statement if there are no imports
  // or exports to ensure this is a module. We don't care about checking this.
  const unformattedActual = (result.code || '').replace('export {};', '');
  let formattedActual;
  try {
    formattedActual = prettier.format(unformattedActual, {
      parser: 'typescript',
    });
  } catch {
    // We might emit invalid TypeScript in a failing test. Rather than fail with
    // a Prettier parse exception, it's more useful to see a diff.
    formattedExpected = expectedJs;
    formattedActual = unformattedActual;
  }
  assert.is(formattedActual, formattedExpected);
  assert.equal(
    result.diagnostics.map((diagnostic) =>
      ts.formatDiagnostic(diagnostic, result.host)
    ),
    []
  );
}

test('empty file', () => {
  const input = ``;
  const expected = ``;
  checkTransform(input, expected);
});

test('no class', () => {
  const input = `
    const a = 0;
  `;
  const expected = `
    const a = 0;
  `;
  checkTransform(input, expected);
});

test('no constructor', () => {
  const input = `
    class MyClass {
      foo() { return 0; }
    }
  `;
  const expected = `
    class MyClass {
      foo() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test('unmodified constructor is unchanged', () => {
  const input = `
    class MyClass {
      foo() { return 0; }
      constructor() {
        console.log(0);
      }
      static bar() { return 0; }
    }
    `;
  const expected = `
    class MyClass {
      foo() { return 0; }
      constructor() {
        console.log(0);
      }
      static bar() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test('modified existing constructor is restored to original position', () => {
  const input = `
    /* Class description */
    class MyClass {
      a = 0;
      foo() { return 0; }
      constructor() {
        console.log(0);
      }
      static bar() { return 0; }
    }
    `;
  const expected = `
    /* Class description */
    class MyClass {
      a = 0;
      foo() { return 0; }
      constructor() {
        console.log(0);
      }
      static bar() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test('modified existing constructor was originally at the top', () => {
  const input = `
    /* Class description */
    class MyClass {
      constructor() {
        console.log(0);
      }
      a = 0;
      foo() { return 0; }
      static bar() { return 0; }
    }
    `;
  const expected = `
    /* Class description */
    class MyClass {
      constructor() {
        console.log(0);
      }
      a = 0;
      foo() { return 0; }
      static bar() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test('fully synthetic constructor moves below last static', () => {
  const input = `
    /* Class description */
    class MyClass {
      i1() { return 0; }
      static s1() { return 0; }
      a = 0;
      static s2() { return 0; }
      i2() { return 0; }
      static s3() { return 0; }
      i3() { return 0; }
      i4() { return 0; }
    }
    `;
  const expected = `
    /* Class description */
    class MyClass {
      i1() { return 0; }
      static s1() { return 0; }
      a = 0;
      static s2() { return 0; }
      i2() { return 0; }
      static s3() { return 0; }
      i3() { return 0; }
      i4() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test('fully synthetic constructor stays at top if there are no statics', () => {
  const input = `
    /* Class description */
    class MyClass {
      i1() { return 0; }
      a = 0;
      i2() { return 0; }
      i3() { return 0; }
      i4() { return 0; }
    }
    `;
  const expected = `
    /* Class description */
    class MyClass {
      i1() { return 0; }
      a = 0;
      i2() { return 0; }
      i3() { return 0; }
      i4() { return 0; }
    }
  `;
  checkTransform(input, expected);
});

test.run();
