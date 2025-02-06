/* Provides CommonJS support for `bundle.js`. */

/** @import {VirtualModuleSource} from 'ses' */
/** @import {BundlerSupport} from './bundle-lite.js' */

/** @typedef {VirtualModuleSource & {cjsFunctor: string}} CjsModuleSource */

import { join } from './node-module-specifier.js';

/** quotes strings */
const q = JSON.stringify;

const exportsCellRecord = exportsList =>
  ''.concat(
    ...exportsList.map(
      exportName => `\
      ${q(exportName)}: cell(${q(exportName)}${
        exportName !== 'default' ? '' : `, {}`
      }),
`,
    ),
  );

// This function is serialized and references variables from its destination scope.
const runtime = `\
function wrapCjsFunctor(index, functor) {
  /* eslint-disable no-undef */
  return ({ imports = {} }) => {
    const moduleCells = cells[index];
    const cModule = Object.freeze(
      Object.defineProperty({}, 'exports', moduleCells.default),
    );
    // TODO: specifier not found handling
    const requireImpl = specifier => cells[imports[specifier]].default.get();
    functor(Object.freeze(requireImpl), cModule.exports, cModule);
    // Update all named cells from module.exports.
    Object.keys(moduleCells)
      .filter(k => k !== 'default' && k !== '*')
      .map(k => moduleCells[k].set(cModule.exports[k]));
    // Add new named cells from module.exports.
    Object.keys(cModule.exports)
      .filter(k => k !== 'default' && k !== '*')
      .filter(k => moduleCells[k] === undefined)
      .map(k => (moduleCells[k] = cell(k, cModule.exports[k])));
    // Update the star cell from all cells.
    const starExports = Object.create(null, {
      // Make this appear like an ESM module namespace object.
      [Symbol.toStringTag]: {
        value: 'Module',
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    Object.keys(moduleCells)
      .filter(k => k !== '*')
      .map(k => Object.defineProperty(starExports, k, moduleCells[k]));
    moduleCells['*'].set(Object.freeze(starExports));
  };
  /* eslint-enable no-undef */
}`;

/** @type {BundlerSupport<CjsModuleSource>} */
export default {
  runtime,
  getBundlerKit(
    {
      index,
      indexedImports,
      moduleSpecifier,
      sourceDirname,
      record: { cjsFunctor, exports: exportsList = {} },
    },
    { useEvaluate = false },
  ) {
    const importsMap = JSON.stringify(indexedImports);

    let functor = cjsFunctor;
    if (useEvaluate) {
      const sourceUrl = join(sourceDirname, moduleSpecifier);
      functor = JSON.stringify([functor, sourceUrl]);
    }

    return {
      getFunctor: () => `\
${functor},
`,
      getCells: () => `\
    {
${exportsCellRecord(exportsList)}\
    },
`,
      getReexportsWiring: () => '',
      getFunctorCall: () => {
        let functorExpression = `functors[${index}]`;
        if (useEvaluate) {
          functorExpression = `evaluateSource(...${functorExpression})`;
        }
        return `\
  wrapCjsFunctor(${index}, ${functorExpression})({imports: ${importsMap}});
`;
      },
    };
  },
};
