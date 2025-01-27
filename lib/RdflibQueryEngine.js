"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _rdflib = require("rdflib");

/**
 * Asynchronous iterator wrapper for the rdflib.js SPARQL query engine.
 */
class RdflibQueryEngine {
  /**
   * Creates a query engine with the given sources as default.
   */
  constructor(defaultSources) {
    // Preload sources but silence errors; they will be thrown during execution
    this._defaultStore = this.readSources(defaultSources);

    this._defaultStore.catch(() => null);
  }
  /**
   * Creates an asynchronous iterable of results for the given SPARQL query.
   */


  async *execute(sparql, sources) {
    if (/^\s*(?:INSERT|DELETE)/i.test(sparql)) yield* this.executeUpdate(sparql, sources); // Parse the SPARQL query

    const query = (0, _rdflib.SPARQLToQuery)(sparql, true, (0, _rdflib.graph)()); // Load the sources if passed, the default sources otherwise

    const store = await (sources ? this.readSources(sources) : this._defaultStore); // Disable link traversal for now (slow, and unreliable error handling)

    store.fetcher = null; // Execute the query and store the results in an array

    const results = [];
    await new Promise((resolve, reject) => {
      store.query(query, result => results.push(result), null, error => error ? reject(error) : resolve(results));
    }); // Convert every result to a map

    const vars = new Set(query.vars.map(v => `?${v.value}`));

    for (const result of results) {
      // Only return explicitly requested variables
      // (workaround for https://github.com/linkeddata/rdflib.js/issues/393)
      const bindings = Object.entries(result).filter(([v]) => vars.has(v));
      yield new Map(bindings);
    }
  }
  /**
   * Creates an asynchronous iterable with the results of the SPARQL UPDATE query.
   */


  async *executeUpdate(sparql, sources) {
    throw new Error(`SPARQL UPDATE queries are unsupported, received: ${sparql}`);
  }
  /**
   * Reads the specified stores into a store.
   */


  async readSources(sourceList, store = (0, _rdflib.graph)()) {
    let source = await sourceList;

    if (source) {
      // Transform URLs or terms into strings
      if (source instanceof URL) source = source.href;else if (source.termType === 'NamedNode') source = source.value; // Read a document from a URL

      if (typeof source === 'string') {
        const document = source.replace(/#.*/, '');
        const fetcher = new _rdflib.Fetcher(store);
        await fetcher.load(document);
      } // Read an array of sources
      else if (Array.isArray(source)) {
        await Promise.all(source.map(s => this.readSources(s, store)));
      } // Read an RDF/JS source
      else if (typeof source.match === 'function') {
        const results = source.match(null, null, null, null);
        await new Promise((resolve, reject) => {
          results.on('data', addQuad);
          results.on('end', finish);
          results.on('error', finish); // Adds a quad to the store

          function addQuad(quad) {
            try {
              store.add(quad.subject, quad.predicate, quad.object, quad.graph);
            } catch (error) {
              finish(error);
            }
          } // Finishes reading the source


          function finish(error) {
            results.removeListener('data', addQuad);
            results.removeListener('end', finish);
            results.removeListener('error', finish);
            return error ? reject(error) : resolve(null);
          }
        });
      } // Error on unsupported sources
      else {
        throw new Error(`Unsupported source: ${source}`);
      }
    }

    return store;
  }
  /**
   * Removes the given document (or all, if not specified) from the cache,
   * such that fresh results are obtained next time.
   */


  async clearCache(document) {// No action required, since we need a new fetcher for every store
  }

}

exports.default = RdflibQueryEngine;