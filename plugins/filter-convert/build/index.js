//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let node_fs = require("node:fs");
node_fs = __toESM(node_fs);
let vm = require("vm");
vm = __toESM(vm);

//#region node_modules/jsonpath-plus/dist/index-node-esm.js
/**
* @implements {IHooks}
*/
var Hooks = class {
	/**
	* @callback HookCallback
	* @this {*|Jsep} this
	* @param {Jsep} env
	* @returns: void
	*/
	/**
	* Adds the given callback to the list of callbacks for the given hook.
	*
	* The callback will be invoked when the hook it is registered for is run.
	*
	* One callback function can be registered to multiple hooks and the same hook multiple times.
	*
	* @param {string|object} name The name of the hook, or an object of callbacks keyed by name
	* @param {HookCallback|boolean} callback The callback function which is given environment variables.
	* @param {?boolean} [first=false] Will add the hook to the top of the list (defaults to the bottom)
	* @public
	*/
	add(name, callback, first) {
		if (typeof arguments[0] != "string") for (let name$1 in arguments[0]) this.add(name$1, arguments[0][name$1], arguments[1]);
		else (Array.isArray(name) ? name : [name]).forEach(function(name$1) {
			this[name$1] = this[name$1] || [];
			if (callback) this[name$1][first ? "unshift" : "push"](callback);
		}, this);
	}
	/**
	* Runs a hook invoking all registered callbacks with the given environment variables.
	*
	* Callbacks will be invoked synchronously and in the order in which they were registered.
	*
	* @param {string} name The name of the hook.
	* @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
	* @public
	*/
	run(name, env) {
		this[name] = this[name] || [];
		this[name].forEach(function(callback) {
			callback.call(env && env.context ? env.context : env, env);
		});
	}
};
/**
* @implements {IPlugins}
*/
var Plugins = class {
	constructor(jsep$1) {
		this.jsep = jsep$1;
		this.registered = {};
	}
	/**
	* @callback PluginSetup
	* @this {Jsep} jsep
	* @returns: void
	*/
	/**
	* Adds the given plugin(s) to the registry
	*
	* @param {object} plugins
	* @param {string} plugins.name The name of the plugin
	* @param {PluginSetup} plugins.init The init function
	* @public
	*/
	register(...plugins) {
		plugins.forEach((plugin$2) => {
			if (typeof plugin$2 !== "object" || !plugin$2.name || !plugin$2.init) throw new Error("Invalid JSEP plugin format");
			if (this.registered[plugin$2.name]) return;
			plugin$2.init(this.jsep);
			this.registered[plugin$2.name] = plugin$2;
		});
	}
};
var Jsep = class Jsep {
	/**
	* @returns {string}
	*/
	static get version() {
		return "1.4.0";
	}
	/**
	* @returns {string}
	*/
	static toString() {
		return "JavaScript Expression Parser (JSEP) v" + Jsep.version;
	}
	/**
	* @method addUnaryOp
	* @param {string} op_name The name of the unary op to add
	* @returns {Jsep}
	*/
	static addUnaryOp(op_name) {
		Jsep.max_unop_len = Math.max(op_name.length, Jsep.max_unop_len);
		Jsep.unary_ops[op_name] = 1;
		return Jsep;
	}
	/**
	* @method jsep.addBinaryOp
	* @param {string} op_name The name of the binary op to add
	* @param {number} precedence The precedence of the binary op (can be a float). Higher number = higher precedence
	* @param {boolean} [isRightAssociative=false] whether operator is right-associative
	* @returns {Jsep}
	*/
	static addBinaryOp(op_name, precedence, isRightAssociative) {
		Jsep.max_binop_len = Math.max(op_name.length, Jsep.max_binop_len);
		Jsep.binary_ops[op_name] = precedence;
		if (isRightAssociative) Jsep.right_associative.add(op_name);
		else Jsep.right_associative.delete(op_name);
		return Jsep;
	}
	/**
	* @method addIdentifierChar
	* @param {string} char The additional character to treat as a valid part of an identifier
	* @returns {Jsep}
	*/
	static addIdentifierChar(char) {
		Jsep.additional_identifier_chars.add(char);
		return Jsep;
	}
	/**
	* @method addLiteral
	* @param {string} literal_name The name of the literal to add
	* @param {*} literal_value The value of the literal
	* @returns {Jsep}
	*/
	static addLiteral(literal_name, literal_value) {
		Jsep.literals[literal_name] = literal_value;
		return Jsep;
	}
	/**
	* @method removeUnaryOp
	* @param {string} op_name The name of the unary op to remove
	* @returns {Jsep}
	*/
	static removeUnaryOp(op_name) {
		delete Jsep.unary_ops[op_name];
		if (op_name.length === Jsep.max_unop_len) Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
		return Jsep;
	}
	/**
	* @method removeAllUnaryOps
	* @returns {Jsep}
	*/
	static removeAllUnaryOps() {
		Jsep.unary_ops = {};
		Jsep.max_unop_len = 0;
		return Jsep;
	}
	/**
	* @method removeIdentifierChar
	* @param {string} char The additional character to stop treating as a valid part of an identifier
	* @returns {Jsep}
	*/
	static removeIdentifierChar(char) {
		Jsep.additional_identifier_chars.delete(char);
		return Jsep;
	}
	/**
	* @method removeBinaryOp
	* @param {string} op_name The name of the binary op to remove
	* @returns {Jsep}
	*/
	static removeBinaryOp(op_name) {
		delete Jsep.binary_ops[op_name];
		if (op_name.length === Jsep.max_binop_len) Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);
		Jsep.right_associative.delete(op_name);
		return Jsep;
	}
	/**
	* @method removeAllBinaryOps
	* @returns {Jsep}
	*/
	static removeAllBinaryOps() {
		Jsep.binary_ops = {};
		Jsep.max_binop_len = 0;
		return Jsep;
	}
	/**
	* @method removeLiteral
	* @param {string} literal_name The name of the literal to remove
	* @returns {Jsep}
	*/
	static removeLiteral(literal_name) {
		delete Jsep.literals[literal_name];
		return Jsep;
	}
	/**
	* @method removeAllLiterals
	* @returns {Jsep}
	*/
	static removeAllLiterals() {
		Jsep.literals = {};
		return Jsep;
	}
	/**
	* @returns {string}
	*/
	get char() {
		return this.expr.charAt(this.index);
	}
	/**
	* @returns {number}
	*/
	get code() {
		return this.expr.charCodeAt(this.index);
	}
	/**
	* @param {string} expr a string with the passed in express
	* @returns Jsep
	*/
	constructor(expr) {
		this.expr = expr;
		this.index = 0;
	}
	/**
	* static top-level parser
	* @returns {jsep.Expression}
	*/
	static parse(expr) {
		return new Jsep(expr).parse();
	}
	/**
	* Get the longest key length of any object
	* @param {object} obj
	* @returns {number}
	*/
	static getMaxKeyLen(obj) {
		return Math.max(0, ...Object.keys(obj).map((k) => k.length));
	}
	/**
	* `ch` is a character code in the next three functions
	* @param {number} ch
	* @returns {boolean}
	*/
	static isDecimalDigit(ch) {
		return ch >= 48 && ch <= 57;
	}
	/**
	* Returns the precedence of a binary operator or `0` if it isn't a binary operator. Can be float.
	* @param {string} op_val
	* @returns {number}
	*/
	static binaryPrecedence(op_val) {
		return Jsep.binary_ops[op_val] || 0;
	}
	/**
	* Looks for start of identifier
	* @param {number} ch
	* @returns {boolean}
	*/
	static isIdentifierStart(ch) {
		return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 || ch >= 128 && !Jsep.binary_ops[String.fromCharCode(ch)] || Jsep.additional_identifier_chars.has(String.fromCharCode(ch));
	}
	/**
	* @param {number} ch
	* @returns {boolean}
	*/
	static isIdentifierPart(ch) {
		return Jsep.isIdentifierStart(ch) || Jsep.isDecimalDigit(ch);
	}
	/**
	* throw error at index of the expression
	* @param {string} message
	* @throws
	*/
	throwError(message) {
		const error = /* @__PURE__ */ new Error(message + " at character " + this.index);
		error.index = this.index;
		error.description = message;
		throw error;
	}
	/**
	* Run a given hook
	* @param {string} name
	* @param {jsep.Expression|false} [node]
	* @returns {?jsep.Expression}
	*/
	runHook(name, node) {
		if (Jsep.hooks[name]) {
			const env = {
				context: this,
				node
			};
			Jsep.hooks.run(name, env);
			return env.node;
		}
		return node;
	}
	/**
	* Runs a given hook until one returns a node
	* @param {string} name
	* @returns {?jsep.Expression}
	*/
	searchHook(name) {
		if (Jsep.hooks[name]) {
			const env = { context: this };
			Jsep.hooks[name].find(function(callback) {
				callback.call(env.context, env);
				return env.node;
			});
			return env.node;
		}
	}
	/**
	* Push `index` up to the next non-space character
	*/
	gobbleSpaces() {
		let ch = this.code;
		while (ch === Jsep.SPACE_CODE || ch === Jsep.TAB_CODE || ch === Jsep.LF_CODE || ch === Jsep.CR_CODE) ch = this.expr.charCodeAt(++this.index);
		this.runHook("gobble-spaces");
	}
	/**
	* Top-level method to parse all expressions and returns compound or single node
	* @returns {jsep.Expression}
	*/
	parse() {
		this.runHook("before-all");
		const nodes = this.gobbleExpressions();
		const node = nodes.length === 1 ? nodes[0] : {
			type: Jsep.COMPOUND,
			body: nodes
		};
		return this.runHook("after-all", node);
	}
	/**
	* top-level parser (but can be reused within as well)
	* @param {number} [untilICode]
	* @returns {jsep.Expression[]}
	*/
	gobbleExpressions(untilICode) {
		let nodes = [], ch_i, node;
		while (this.index < this.expr.length) {
			ch_i = this.code;
			if (ch_i === Jsep.SEMCOL_CODE || ch_i === Jsep.COMMA_CODE) this.index++;
			else if (node = this.gobbleExpression()) nodes.push(node);
			else if (this.index < this.expr.length) {
				if (ch_i === untilICode) break;
				this.throwError("Unexpected \"" + this.char + "\"");
			}
		}
		return nodes;
	}
	/**
	* The main parsing function.
	* @returns {?jsep.Expression}
	*/
	gobbleExpression() {
		const node = this.searchHook("gobble-expression") || this.gobbleBinaryExpression();
		this.gobbleSpaces();
		return this.runHook("after-expression", node);
	}
	/**
	* Search for the operation portion of the string (e.g. `+`, `===`)
	* Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
	* and move down from 3 to 2 to 1 character until a matching binary operation is found
	* then, return that binary operation
	* @returns {string|boolean}
	*/
	gobbleBinaryOp() {
		this.gobbleSpaces();
		let to_check = this.expr.substr(this.index, Jsep.max_binop_len);
		let tc_len = to_check.length;
		while (tc_len > 0) {
			if (Jsep.binary_ops.hasOwnProperty(to_check) && (!Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
				this.index += tc_len;
				return to_check;
			}
			to_check = to_check.substr(0, --tc_len);
		}
		return false;
	}
	/**
	* This function is responsible for gobbling an individual expression,
	* e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
	* @returns {?jsep.BinaryExpression}
	*/
	gobbleBinaryExpression() {
		let node, biop, prec, stack, biop_info, left, right, i, cur_biop;
		left = this.gobbleToken();
		if (!left) return left;
		biop = this.gobbleBinaryOp();
		if (!biop) return left;
		biop_info = {
			value: biop,
			prec: Jsep.binaryPrecedence(biop),
			right_a: Jsep.right_associative.has(biop)
		};
		right = this.gobbleToken();
		if (!right) this.throwError("Expected expression after " + biop);
		stack = [
			left,
			biop_info,
			right
		];
		while (biop = this.gobbleBinaryOp()) {
			prec = Jsep.binaryPrecedence(biop);
			if (prec === 0) {
				this.index -= biop.length;
				break;
			}
			biop_info = {
				value: biop,
				prec,
				right_a: Jsep.right_associative.has(biop)
			};
			cur_biop = biop;
			const comparePrev = (prev) => biop_info.right_a && prev.right_a ? prec > prev.prec : prec <= prev.prec;
			while (stack.length > 2 && comparePrev(stack[stack.length - 2])) {
				right = stack.pop();
				biop = stack.pop().value;
				left = stack.pop();
				node = {
					type: Jsep.BINARY_EXP,
					operator: biop,
					left,
					right
				};
				stack.push(node);
			}
			node = this.gobbleToken();
			if (!node) this.throwError("Expected expression after " + cur_biop);
			stack.push(biop_info, node);
		}
		i = stack.length - 1;
		node = stack[i];
		while (i > 1) {
			node = {
				type: Jsep.BINARY_EXP,
				operator: stack[i - 1].value,
				left: stack[i - 2],
				right: node
			};
			i -= 2;
		}
		return node;
	}
	/**
	* An individual part of a binary expression:
	* e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
	* @returns {boolean|jsep.Expression}
	*/
	gobbleToken() {
		let ch, to_check, tc_len, node;
		this.gobbleSpaces();
		node = this.searchHook("gobble-token");
		if (node) return this.runHook("after-token", node);
		ch = this.code;
		if (Jsep.isDecimalDigit(ch) || ch === Jsep.PERIOD_CODE) return this.gobbleNumericLiteral();
		if (ch === Jsep.SQUOTE_CODE || ch === Jsep.DQUOTE_CODE) node = this.gobbleStringLiteral();
		else if (ch === Jsep.OBRACK_CODE) node = this.gobbleArray();
		else {
			to_check = this.expr.substr(this.index, Jsep.max_unop_len);
			tc_len = to_check.length;
			while (tc_len > 0) {
				if (Jsep.unary_ops.hasOwnProperty(to_check) && (!Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
					this.index += tc_len;
					const argument = this.gobbleToken();
					if (!argument) this.throwError("missing unaryOp argument");
					return this.runHook("after-token", {
						type: Jsep.UNARY_EXP,
						operator: to_check,
						argument,
						prefix: true
					});
				}
				to_check = to_check.substr(0, --tc_len);
			}
			if (Jsep.isIdentifierStart(ch)) {
				node = this.gobbleIdentifier();
				if (Jsep.literals.hasOwnProperty(node.name)) node = {
					type: Jsep.LITERAL,
					value: Jsep.literals[node.name],
					raw: node.name
				};
				else if (node.name === Jsep.this_str) node = { type: Jsep.THIS_EXP };
			} else if (ch === Jsep.OPAREN_CODE) node = this.gobbleGroup();
		}
		if (!node) return this.runHook("after-token", false);
		node = this.gobbleTokenProperty(node);
		return this.runHook("after-token", node);
	}
	/**
	* Gobble properties of of identifiers/strings/arrays/groups.
	* e.g. `foo`, `bar.baz`, `foo['bar'].baz`
	* It also gobbles function calls:
	* e.g. `Math.acos(obj.angle)`
	* @param {jsep.Expression} node
	* @returns {jsep.Expression}
	*/
	gobbleTokenProperty(node) {
		this.gobbleSpaces();
		let ch = this.code;
		while (ch === Jsep.PERIOD_CODE || ch === Jsep.OBRACK_CODE || ch === Jsep.OPAREN_CODE || ch === Jsep.QUMARK_CODE) {
			let optional;
			if (ch === Jsep.QUMARK_CODE) {
				if (this.expr.charCodeAt(this.index + 1) !== Jsep.PERIOD_CODE) break;
				optional = true;
				this.index += 2;
				this.gobbleSpaces();
				ch = this.code;
			}
			this.index++;
			if (ch === Jsep.OBRACK_CODE) {
				node = {
					type: Jsep.MEMBER_EXP,
					computed: true,
					object: node,
					property: this.gobbleExpression()
				};
				if (!node.property) this.throwError("Unexpected \"" + this.char + "\"");
				this.gobbleSpaces();
				ch = this.code;
				if (ch !== Jsep.CBRACK_CODE) this.throwError("Unclosed [");
				this.index++;
			} else if (ch === Jsep.OPAREN_CODE) node = {
				type: Jsep.CALL_EXP,
				"arguments": this.gobbleArguments(Jsep.CPAREN_CODE),
				callee: node
			};
			else if (ch === Jsep.PERIOD_CODE || optional) {
				if (optional) this.index--;
				this.gobbleSpaces();
				node = {
					type: Jsep.MEMBER_EXP,
					computed: false,
					object: node,
					property: this.gobbleIdentifier()
				};
			}
			if (optional) node.optional = true;
			this.gobbleSpaces();
			ch = this.code;
		}
		return node;
	}
	/**
	* Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
	* keep track of everything in the numeric literal and then calling `parseFloat` on that string
	* @returns {jsep.Literal}
	*/
	gobbleNumericLiteral() {
		let number = "", ch, chCode;
		while (Jsep.isDecimalDigit(this.code)) number += this.expr.charAt(this.index++);
		if (this.code === Jsep.PERIOD_CODE) {
			number += this.expr.charAt(this.index++);
			while (Jsep.isDecimalDigit(this.code)) number += this.expr.charAt(this.index++);
		}
		ch = this.char;
		if (ch === "e" || ch === "E") {
			number += this.expr.charAt(this.index++);
			ch = this.char;
			if (ch === "+" || ch === "-") number += this.expr.charAt(this.index++);
			while (Jsep.isDecimalDigit(this.code)) number += this.expr.charAt(this.index++);
			if (!Jsep.isDecimalDigit(this.expr.charCodeAt(this.index - 1))) this.throwError("Expected exponent (" + number + this.char + ")");
		}
		chCode = this.code;
		if (Jsep.isIdentifierStart(chCode)) this.throwError("Variable names cannot start with a number (" + number + this.char + ")");
		else if (chCode === Jsep.PERIOD_CODE || number.length === 1 && number.charCodeAt(0) === Jsep.PERIOD_CODE) this.throwError("Unexpected period");
		return {
			type: Jsep.LITERAL,
			value: parseFloat(number),
			raw: number
		};
	}
	/**
	* Parses a string literal, staring with single or double quotes with basic support for escape codes
	* e.g. `"hello world"`, `'this is\nJSEP'`
	* @returns {jsep.Literal}
	*/
	gobbleStringLiteral() {
		let str = "";
		const startIndex = this.index;
		const quote = this.expr.charAt(this.index++);
		let closed = false;
		while (this.index < this.expr.length) {
			let ch = this.expr.charAt(this.index++);
			if (ch === quote) {
				closed = true;
				break;
			} else if (ch === "\\") {
				ch = this.expr.charAt(this.index++);
				switch (ch) {
					case "n":
						str += "\n";
						break;
					case "r":
						str += "\r";
						break;
					case "t":
						str += "	";
						break;
					case "b":
						str += "\b";
						break;
					case "f":
						str += "\f";
						break;
					case "v":
						str += "\v";
						break;
					default: str += ch;
				}
			} else str += ch;
		}
		if (!closed) this.throwError("Unclosed quote after \"" + str + "\"");
		return {
			type: Jsep.LITERAL,
			value: str,
			raw: this.expr.substring(startIndex, this.index)
		};
	}
	/**
	* Gobbles only identifiers
	* e.g.: `foo`, `_value`, `$x1`
	* Also, this function checks if that identifier is a literal:
	* (e.g. `true`, `false`, `null`) or `this`
	* @returns {jsep.Identifier}
	*/
	gobbleIdentifier() {
		let ch = this.code, start = this.index;
		if (Jsep.isIdentifierStart(ch)) this.index++;
		else this.throwError("Unexpected " + this.char);
		while (this.index < this.expr.length) {
			ch = this.code;
			if (Jsep.isIdentifierPart(ch)) this.index++;
			else break;
		}
		return {
			type: Jsep.IDENTIFIER,
			name: this.expr.slice(start, this.index)
		};
	}
	/**
	* Gobbles a list of arguments within the context of a function call
	* or array literal. This function also assumes that the opening character
	* `(` or `[` has already been gobbled, and gobbles expressions and commas
	* until the terminator character `)` or `]` is encountered.
	* e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
	* @param {number} termination
	* @returns {jsep.Expression[]}
	*/
	gobbleArguments(termination) {
		const args = [];
		let closed = false;
		let separator_count = 0;
		while (this.index < this.expr.length) {
			this.gobbleSpaces();
			let ch_i = this.code;
			if (ch_i === termination) {
				closed = true;
				this.index++;
				if (termination === Jsep.CPAREN_CODE && separator_count && separator_count >= args.length) this.throwError("Unexpected token " + String.fromCharCode(termination));
				break;
			} else if (ch_i === Jsep.COMMA_CODE) {
				this.index++;
				separator_count++;
				if (separator_count !== args.length) {
					if (termination === Jsep.CPAREN_CODE) this.throwError("Unexpected token ,");
					else if (termination === Jsep.CBRACK_CODE) for (let arg = args.length; arg < separator_count; arg++) args.push(null);
				}
			} else if (args.length !== separator_count && separator_count !== 0) this.throwError("Expected comma");
			else {
				const node = this.gobbleExpression();
				if (!node || node.type === Jsep.COMPOUND) this.throwError("Expected comma");
				args.push(node);
			}
		}
		if (!closed) this.throwError("Expected " + String.fromCharCode(termination));
		return args;
	}
	/**
	* Responsible for parsing a group of things within parentheses `()`
	* that have no identifier in front (so not a function call)
	* This function assumes that it needs to gobble the opening parenthesis
	* and then tries to gobble everything within that parenthesis, assuming
	* that the next thing it should see is the close parenthesis. If not,
	* then the expression probably doesn't have a `)`
	* @returns {boolean|jsep.Expression}
	*/
	gobbleGroup() {
		this.index++;
		let nodes = this.gobbleExpressions(Jsep.CPAREN_CODE);
		if (this.code === Jsep.CPAREN_CODE) {
			this.index++;
			if (nodes.length === 1) return nodes[0];
			else if (!nodes.length) return false;
			else return {
				type: Jsep.SEQUENCE_EXP,
				expressions: nodes
			};
		} else this.throwError("Unclosed (");
	}
	/**
	* Responsible for parsing Array literals `[1, 2, 3]`
	* This function assumes that it needs to gobble the opening bracket
	* and then tries to gobble the expressions as arguments.
	* @returns {jsep.ArrayExpression}
	*/
	gobbleArray() {
		this.index++;
		return {
			type: Jsep.ARRAY_EXP,
			elements: this.gobbleArguments(Jsep.CBRACK_CODE)
		};
	}
};
const hooks = new Hooks();
Object.assign(Jsep, {
	hooks,
	plugins: new Plugins(Jsep),
	COMPOUND: "Compound",
	SEQUENCE_EXP: "SequenceExpression",
	IDENTIFIER: "Identifier",
	MEMBER_EXP: "MemberExpression",
	LITERAL: "Literal",
	THIS_EXP: "ThisExpression",
	CALL_EXP: "CallExpression",
	UNARY_EXP: "UnaryExpression",
	BINARY_EXP: "BinaryExpression",
	ARRAY_EXP: "ArrayExpression",
	TAB_CODE: 9,
	LF_CODE: 10,
	CR_CODE: 13,
	SPACE_CODE: 32,
	PERIOD_CODE: 46,
	COMMA_CODE: 44,
	SQUOTE_CODE: 39,
	DQUOTE_CODE: 34,
	OPAREN_CODE: 40,
	CPAREN_CODE: 41,
	OBRACK_CODE: 91,
	CBRACK_CODE: 93,
	QUMARK_CODE: 63,
	SEMCOL_CODE: 59,
	COLON_CODE: 58,
	unary_ops: {
		"-": 1,
		"!": 1,
		"~": 1,
		"+": 1
	},
	binary_ops: {
		"||": 1,
		"??": 1,
		"&&": 2,
		"|": 3,
		"^": 4,
		"&": 5,
		"==": 6,
		"!=": 6,
		"===": 6,
		"!==": 6,
		"<": 7,
		">": 7,
		"<=": 7,
		">=": 7,
		"<<": 8,
		">>": 8,
		">>>": 8,
		"+": 9,
		"-": 9,
		"*": 10,
		"/": 10,
		"%": 10,
		"**": 11
	},
	right_associative: new Set(["**"]),
	additional_identifier_chars: new Set(["$", "_"]),
	literals: {
		"true": true,
		"false": false,
		"null": null
	},
	this_str: "this"
});
Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);
const jsep = (expr) => new Jsep(expr).parse();
const stdClassProps = Object.getOwnPropertyNames(class Test {});
Object.getOwnPropertyNames(Jsep).filter((prop) => !stdClassProps.includes(prop) && jsep[prop] === void 0).forEach((m) => {
	jsep[m] = Jsep[m];
});
jsep.Jsep = Jsep;
const CONDITIONAL_EXP = "ConditionalExpression";
jsep.plugins.register({
	name: "ternary",
	init(jsep$1) {
		jsep$1.hooks.add("after-expression", function gobbleTernary(env) {
			if (env.node && this.code === jsep$1.QUMARK_CODE) {
				this.index++;
				const test = env.node;
				const consequent = this.gobbleExpression();
				if (!consequent) this.throwError("Expected expression");
				this.gobbleSpaces();
				if (this.code === jsep$1.COLON_CODE) {
					this.index++;
					const alternate = this.gobbleExpression();
					if (!alternate) this.throwError("Expected expression");
					env.node = {
						type: CONDITIONAL_EXP,
						test,
						consequent,
						alternate
					};
					if (test.operator && jsep$1.binary_ops[test.operator] <= .9) {
						let newTest = test;
						while (newTest.right.operator && jsep$1.binary_ops[newTest.right.operator] <= .9) newTest = newTest.right;
						env.node.test = newTest.right;
						newTest.right = env.node;
						env.node = test;
					}
				} else this.throwError("Expected :");
			}
		});
	}
});
const FSLASH_CODE = 47;
const BSLASH_CODE = 92;
var index = {
	name: "regex",
	init(jsep$1) {
		jsep$1.hooks.add("gobble-token", function gobbleRegexLiteral(env) {
			if (this.code === FSLASH_CODE) {
				const patternIndex = ++this.index;
				let inCharSet = false;
				while (this.index < this.expr.length) {
					if (this.code === FSLASH_CODE && !inCharSet) {
						const pattern = this.expr.slice(patternIndex, this.index);
						let flags = "";
						while (++this.index < this.expr.length) {
							const code = this.code;
							if (code >= 97 && code <= 122 || code >= 65 && code <= 90 || code >= 48 && code <= 57) flags += this.char;
							else break;
						}
						let value;
						try {
							value = new RegExp(pattern, flags);
						} catch (e) {
							this.throwError(e.message);
						}
						env.node = {
							type: jsep$1.LITERAL,
							value,
							raw: this.expr.slice(patternIndex - 1, this.index)
						};
						env.node = this.gobbleTokenProperty(env.node);
						return env.node;
					}
					if (this.code === jsep$1.OBRACK_CODE) inCharSet = true;
					else if (inCharSet && this.code === jsep$1.CBRACK_CODE) inCharSet = false;
					this.index += this.code === BSLASH_CODE ? 2 : 1;
				}
				this.throwError("Unclosed Regex");
			}
		});
	}
};
const PLUS_CODE = 43;
const plugin$1 = {
	name: "assignment",
	assignmentOperators: new Set([
		"=",
		"*=",
		"**=",
		"/=",
		"%=",
		"+=",
		"-=",
		"<<=",
		">>=",
		">>>=",
		"&=",
		"^=",
		"|=",
		"||=",
		"&&=",
		"??="
	]),
	updateOperators: [PLUS_CODE, 45],
	assignmentPrecedence: .9,
	init(jsep$1) {
		const updateNodeTypes = [jsep$1.IDENTIFIER, jsep$1.MEMBER_EXP];
		plugin$1.assignmentOperators.forEach((op) => jsep$1.addBinaryOp(op, plugin$1.assignmentPrecedence, true));
		jsep$1.hooks.add("gobble-token", function gobbleUpdatePrefix(env) {
			const code = this.code;
			if (plugin$1.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
				this.index += 2;
				env.node = {
					type: "UpdateExpression",
					operator: code === PLUS_CODE ? "++" : "--",
					argument: this.gobbleTokenProperty(this.gobbleIdentifier()),
					prefix: true
				};
				if (!env.node.argument || !updateNodeTypes.includes(env.node.argument.type)) this.throwError(`Unexpected ${env.node.operator}`);
			}
		});
		jsep$1.hooks.add("after-token", function gobbleUpdatePostfix(env) {
			if (env.node) {
				const code = this.code;
				if (plugin$1.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
					if (!updateNodeTypes.includes(env.node.type)) this.throwError(`Unexpected ${env.node.operator}`);
					this.index += 2;
					env.node = {
						type: "UpdateExpression",
						operator: code === PLUS_CODE ? "++" : "--",
						argument: env.node,
						prefix: false
					};
				}
			}
		});
		jsep$1.hooks.add("after-expression", function gobbleAssignment(env) {
			if (env.node) updateBinariesToAssignments(env.node);
		});
		function updateBinariesToAssignments(node) {
			if (plugin$1.assignmentOperators.has(node.operator)) {
				node.type = "AssignmentExpression";
				updateBinariesToAssignments(node.left);
				updateBinariesToAssignments(node.right);
			} else if (!node.operator) Object.values(node).forEach((val) => {
				if (val && typeof val === "object") updateBinariesToAssignments(val);
			});
		}
	}
};
jsep.plugins.register(index, plugin$1);
jsep.addUnaryOp("typeof");
jsep.addUnaryOp("void");
jsep.addLiteral("null", null);
jsep.addLiteral("undefined", void 0);
const BLOCKED_PROTO_PROPERTIES = new Set([
	"constructor",
	"__proto__",
	"__defineGetter__",
	"__defineSetter__",
	"__lookupGetter__",
	"__lookupSetter__"
]);
const SafeEval = {
	evalAst(ast, subs) {
		switch (ast.type) {
			case "BinaryExpression":
			case "LogicalExpression": return SafeEval.evalBinaryExpression(ast, subs);
			case "Compound": return SafeEval.evalCompound(ast, subs);
			case "ConditionalExpression": return SafeEval.evalConditionalExpression(ast, subs);
			case "Identifier": return SafeEval.evalIdentifier(ast, subs);
			case "Literal": return SafeEval.evalLiteral(ast, subs);
			case "MemberExpression": return SafeEval.evalMemberExpression(ast, subs);
			case "UnaryExpression": return SafeEval.evalUnaryExpression(ast, subs);
			case "ArrayExpression": return SafeEval.evalArrayExpression(ast, subs);
			case "CallExpression": return SafeEval.evalCallExpression(ast, subs);
			case "AssignmentExpression": return SafeEval.evalAssignmentExpression(ast, subs);
			default: throw SyntaxError("Unexpected expression", ast);
		}
	},
	evalBinaryExpression(ast, subs) {
		return {
			"||": (a, b) => a || b(),
			"&&": (a, b) => a && b(),
			"|": (a, b) => a | b(),
			"^": (a, b) => a ^ b(),
			"&": (a, b) => a & b(),
			"==": (a, b) => a == b(),
			"!=": (a, b) => a != b(),
			"===": (a, b) => a === b(),
			"!==": (a, b) => a !== b(),
			"<": (a, b) => a < b(),
			">": (a, b) => a > b(),
			"<=": (a, b) => a <= b(),
			">=": (a, b) => a >= b(),
			"<<": (a, b) => a << b(),
			">>": (a, b) => a >> b(),
			">>>": (a, b) => a >>> b(),
			"+": (a, b) => a + b(),
			"-": (a, b) => a - b(),
			"*": (a, b) => a * b(),
			"/": (a, b) => a / b(),
			"%": (a, b) => a % b()
		}[ast.operator](SafeEval.evalAst(ast.left, subs), () => SafeEval.evalAst(ast.right, subs));
	},
	evalCompound(ast, subs) {
		let last;
		for (let i = 0; i < ast.body.length; i++) {
			if (ast.body[i].type === "Identifier" && [
				"var",
				"let",
				"const"
			].includes(ast.body[i].name) && ast.body[i + 1] && ast.body[i + 1].type === "AssignmentExpression") i += 1;
			const expr = ast.body[i];
			last = SafeEval.evalAst(expr, subs);
		}
		return last;
	},
	evalConditionalExpression(ast, subs) {
		if (SafeEval.evalAst(ast.test, subs)) return SafeEval.evalAst(ast.consequent, subs);
		return SafeEval.evalAst(ast.alternate, subs);
	},
	evalIdentifier(ast, subs) {
		if (Object.hasOwn(subs, ast.name)) return subs[ast.name];
		throw ReferenceError(`${ast.name} is not defined`);
	},
	evalLiteral(ast) {
		return ast.value;
	},
	evalMemberExpression(ast, subs) {
		const prop = String(ast.computed ? SafeEval.evalAst(ast.property) : ast.property.name);
		const obj = SafeEval.evalAst(ast.object, subs);
		if (obj === void 0 || obj === null) throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
		if (!Object.hasOwn(obj, prop) && BLOCKED_PROTO_PROPERTIES.has(prop)) throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
		const result = obj[prop];
		if (typeof result === "function") return result.bind(obj);
		return result;
	},
	evalUnaryExpression(ast, subs) {
		return {
			"-": (a) => -SafeEval.evalAst(a, subs),
			"!": (a) => !SafeEval.evalAst(a, subs),
			"~": (a) => ~SafeEval.evalAst(a, subs),
			"+": (a) => +SafeEval.evalAst(a, subs),
			typeof: (a) => typeof SafeEval.evalAst(a, subs),
			void: (a) => void SafeEval.evalAst(a, subs)
		}[ast.operator](ast.argument);
	},
	evalArrayExpression(ast, subs) {
		return ast.elements.map((el) => SafeEval.evalAst(el, subs));
	},
	evalCallExpression(ast, subs) {
		const args = ast.arguments.map((arg) => SafeEval.evalAst(arg, subs));
		const func = SafeEval.evalAst(ast.callee, subs);
		/* c8 ignore start  */
		if (func === Function) throw new Error("Function constructor is disabled");
		/* c8 ignore end  */
		return func(...args);
	},
	evalAssignmentExpression(ast, subs) {
		if (ast.left.type !== "Identifier") throw SyntaxError("Invalid left-hand side in assignment");
		const id = ast.left.name;
		subs[id] = SafeEval.evalAst(ast.right, subs);
		return subs[id];
	}
};
/**
* A replacement for NodeJS' VM.Script which is also {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP | Content Security Policy} friendly.
*/
var SafeScript = class {
	/**
	* @param {string} expr Expression to evaluate
	*/
	constructor(expr) {
		this.code = expr;
		this.ast = jsep(this.code);
	}
	/**
	* @param {object} context Object whose items will be added
	*   to evaluation
	* @returns {EvaluatedResult} Result of evaluated code
	*/
	runInNewContext(context) {
		const keyMap = Object.assign(Object.create(null), context);
		return SafeEval.evalAst(this.ast, keyMap);
	}
};
/**
* @typedef {null|boolean|number|string|object|GenericArray} JSONObject
*/
/**
* @typedef {any} AnyItem
*/
/**
* @typedef {any} AnyResult
*/
/**
* Copies array and then pushes item into it.
* @param {GenericArray} arr Array to copy and into which to push
* @param {AnyItem} item Array item to add (to end)
* @returns {GenericArray} Copy of the original array
*/
function push(arr, item) {
	arr = arr.slice();
	arr.push(item);
	return arr;
}
/**
* Copies array and then unshifts item into it.
* @param {AnyItem} item Array item to add (to beginning)
* @param {GenericArray} arr Array to copy and into which to unshift
* @returns {GenericArray} Copy of the original array
*/
function unshift(item, arr) {
	arr = arr.slice();
	arr.unshift(item);
	return arr;
}
/**
* Caught when JSONPath is used without `new` but rethrown if with `new`
* @extends Error
*/
var NewError = class extends Error {
	/**
	* @param {AnyResult} value The evaluated scalar value
	*/
	constructor(value) {
		super("JSONPath should not be called with \"new\" (it prevents return of (unwrapped) scalar values)");
		this.avoidNew = true;
		this.value = value;
		this.name = "NewError";
	}
};
/**
* @typedef {object} ReturnObject
* @property {string} path
* @property {JSONObject} value
* @property {object|GenericArray} parent
* @property {string} parentProperty
*/
/**
* @callback JSONPathCallback
* @param {string|object} preferredOutput
* @param {"value"|"property"} type
* @param {ReturnObject} fullRetObj
* @returns {void}
*/
/**
* @callback OtherTypeCallback
* @param {JSONObject} val
* @param {string} path
* @param {object|GenericArray} parent
* @param {string} parentPropName
* @returns {boolean}
*/
/**
* @typedef {any} ContextItem
*/
/**
* @typedef {any} EvaluatedResult
*/
/**
* @callback EvalCallback
* @param {string} code
* @param {ContextItem} context
* @returns {EvaluatedResult}
*/
/**
* @typedef {typeof SafeScript} EvalClass
*/
/**
* @typedef {object} JSONPathOptions
* @property {JSON} json
* @property {string|string[]} path
* @property {"value"|"path"|"pointer"|"parent"|"parentProperty"|
*   "all"} [resultType="value"]
* @property {boolean} [flatten=false]
* @property {boolean} [wrap=true]
* @property {object} [sandbox={}]
* @property {EvalCallback|EvalClass|'safe'|'native'|
*   boolean} [eval = 'safe']
* @property {object|GenericArray|null} [parent=null]
* @property {string|null} [parentProperty=null]
* @property {JSONPathCallback} [callback]
* @property {OtherTypeCallback} [otherTypeCallback] Defaults to
*   function which throws on encountering `@other`
* @property {boolean} [autostart=true]
*/
/**
* @param {string|JSONPathOptions} opts If a string, will be treated as `expr`
* @param {string} [expr] JSON path to evaluate
* @param {JSON} [obj] JSON object to evaluate against
* @param {JSONPathCallback} [callback] Passed 3 arguments: 1) desired payload
*     per `resultType`, 2) `"value"|"property"`, 3) Full returned object with
*     all payloads
* @param {OtherTypeCallback} [otherTypeCallback] If `@other()` is at the end
*   of one's query, this will be invoked with the value of the item, its
*   path, its parent, and its parent's property name, and it should return
*   a boolean indicating whether the supplied value belongs to the "other"
*   type or not (or it may handle transformations and return `false`).
* @returns {JSONPath}
* @class
*/
function JSONPath(opts, expr, obj, callback, otherTypeCallback) {
	if (!(this instanceof JSONPath)) try {
		return new JSONPath(opts, expr, obj, callback, otherTypeCallback);
	} catch (e) {
		if (!e.avoidNew) throw e;
		return e.value;
	}
	if (typeof opts === "string") {
		otherTypeCallback = callback;
		callback = obj;
		obj = expr;
		expr = opts;
		opts = null;
	}
	const optObj = opts && typeof opts === "object";
	opts = opts || {};
	this.json = opts.json || obj;
	this.path = opts.path || expr;
	this.resultType = opts.resultType || "value";
	this.flatten = opts.flatten || false;
	this.wrap = Object.hasOwn(opts, "wrap") ? opts.wrap : true;
	this.sandbox = opts.sandbox || {};
	this.eval = opts.eval === void 0 ? "safe" : opts.eval;
	this.ignoreEvalErrors = typeof opts.ignoreEvalErrors === "undefined" ? false : opts.ignoreEvalErrors;
	this.parent = opts.parent || null;
	this.parentProperty = opts.parentProperty || null;
	this.callback = opts.callback || callback || null;
	this.otherTypeCallback = opts.otherTypeCallback || otherTypeCallback || function() {
		throw new TypeError("You must supply an otherTypeCallback callback option with the @other() operator.");
	};
	if (opts.autostart !== false) {
		const args = { path: optObj ? opts.path : expr };
		if (!optObj) args.json = obj;
		else if ("json" in opts) args.json = opts.json;
		const ret = this.evaluate(args);
		if (!ret || typeof ret !== "object") throw new NewError(ret);
		return ret;
	}
}
JSONPath.prototype.evaluate = function(expr, json, callback, otherTypeCallback) {
	let currParent = this.parent, currParentProperty = this.parentProperty;
	let { flatten, wrap } = this;
	this.currResultType = this.resultType;
	this.currEval = this.eval;
	this.currSandbox = this.sandbox;
	callback = callback || this.callback;
	this.currOtherTypeCallback = otherTypeCallback || this.otherTypeCallback;
	json = json || this.json;
	expr = expr || this.path;
	if (expr && typeof expr === "object" && !Array.isArray(expr)) {
		if (!expr.path && expr.path !== "") throw new TypeError("You must supply a \"path\" property when providing an object argument to JSONPath.evaluate().");
		if (!Object.hasOwn(expr, "json")) throw new TypeError("You must supply a \"json\" property when providing an object argument to JSONPath.evaluate().");
		({json} = expr);
		flatten = Object.hasOwn(expr, "flatten") ? expr.flatten : flatten;
		this.currResultType = Object.hasOwn(expr, "resultType") ? expr.resultType : this.currResultType;
		this.currSandbox = Object.hasOwn(expr, "sandbox") ? expr.sandbox : this.currSandbox;
		wrap = Object.hasOwn(expr, "wrap") ? expr.wrap : wrap;
		this.currEval = Object.hasOwn(expr, "eval") ? expr.eval : this.currEval;
		callback = Object.hasOwn(expr, "callback") ? expr.callback : callback;
		this.currOtherTypeCallback = Object.hasOwn(expr, "otherTypeCallback") ? expr.otherTypeCallback : this.currOtherTypeCallback;
		currParent = Object.hasOwn(expr, "parent") ? expr.parent : currParent;
		currParentProperty = Object.hasOwn(expr, "parentProperty") ? expr.parentProperty : currParentProperty;
		expr = expr.path;
	}
	currParent = currParent || null;
	currParentProperty = currParentProperty || null;
	if (Array.isArray(expr)) expr = JSONPath.toPathString(expr);
	if (!expr && expr !== "" || !json) return;
	const exprList = JSONPath.toPathArray(expr);
	if (exprList[0] === "$" && exprList.length > 1) exprList.shift();
	this._hasParentSelector = null;
	const result = this._trace(exprList, json, ["$"], currParent, currParentProperty, callback).filter(function(ea) {
		return ea && !ea.isParentSelector;
	});
	if (!result.length) return wrap ? [] : void 0;
	if (!wrap && result.length === 1 && !result[0].hasArrExpr) return this._getPreferredOutput(result[0]);
	return result.reduce((rslt, ea) => {
		const valOrPath = this._getPreferredOutput(ea);
		if (flatten && Array.isArray(valOrPath)) rslt = rslt.concat(valOrPath);
		else rslt.push(valOrPath);
		return rslt;
	}, []);
};
JSONPath.prototype._getPreferredOutput = function(ea) {
	const resultType = this.currResultType;
	switch (resultType) {
		case "all": {
			const path = Array.isArray(ea.path) ? ea.path : JSONPath.toPathArray(ea.path);
			ea.pointer = JSONPath.toPointer(path);
			ea.path = typeof ea.path === "string" ? ea.path : JSONPath.toPathString(ea.path);
			return ea;
		}
		case "value":
		case "parent":
		case "parentProperty": return ea[resultType];
		case "path": return JSONPath.toPathString(ea[resultType]);
		case "pointer": return JSONPath.toPointer(ea.path);
		default: throw new TypeError("Unknown result type");
	}
};
JSONPath.prototype._handleCallback = function(fullRetObj, callback, type) {
	if (callback) {
		const preferredOutput = this._getPreferredOutput(fullRetObj);
		fullRetObj.path = typeof fullRetObj.path === "string" ? fullRetObj.path : JSONPath.toPathString(fullRetObj.path);
		callback(preferredOutput, type, fullRetObj);
	}
};
/**
*
* @param {string} expr
* @param {JSONObject} val
* @param {string} path
* @param {object|GenericArray} parent
* @param {string} parentPropName
* @param {JSONPathCallback} callback
* @param {boolean} hasArrExpr
* @param {boolean} literalPriority
* @returns {ReturnObject|ReturnObject[]}
*/
JSONPath.prototype._trace = function(expr, val, path, parent, parentPropName, callback, hasArrExpr, literalPriority) {
	let retObj;
	if (!expr.length) {
		retObj = {
			path,
			value: val,
			parent,
			parentProperty: parentPropName,
			hasArrExpr
		};
		this._handleCallback(retObj, callback, "value");
		return retObj;
	}
	const loc = expr[0], x = expr.slice(1);
	const ret = [];
	/**
	*
	* @param {ReturnObject|ReturnObject[]} elems
	* @returns {void}
	*/
	function addRet(elems) {
		if (Array.isArray(elems)) elems.forEach((t) => {
			ret.push(t);
		});
		else ret.push(elems);
	}
	if ((typeof loc !== "string" || literalPriority) && val && Object.hasOwn(val, loc)) addRet(this._trace(x, val[loc], push(path, loc), val, loc, callback, hasArrExpr));
	else if (loc === "*") this._walk(val, (m) => {
		addRet(this._trace(x, val[m], push(path, m), val, m, callback, true, true));
	});
	else if (loc === "..") {
		addRet(this._trace(x, val, path, parent, parentPropName, callback, hasArrExpr));
		this._walk(val, (m) => {
			if (typeof val[m] === "object") addRet(this._trace(expr.slice(), val[m], push(path, m), val, m, callback, true));
		});
	} else if (loc === "^") {
		this._hasParentSelector = true;
		return {
			path: path.slice(0, -1),
			expr: x,
			isParentSelector: true
		};
	} else if (loc === "~") {
		retObj = {
			path: push(path, loc),
			value: parentPropName,
			parent,
			parentProperty: null
		};
		this._handleCallback(retObj, callback, "property");
		return retObj;
	} else if (loc === "$") addRet(this._trace(x, val, path, null, null, callback, hasArrExpr));
	else if (/^(-?\d*):(-?\d*):?(\d*)$/u.test(loc)) addRet(this._slice(loc, x, val, path, parent, parentPropName, callback));
	else if (loc.indexOf("?(") === 0) {
		if (this.currEval === false) throw new Error("Eval [?(expr)] prevented in JSONPath expression.");
		const safeLoc = loc.replace(/^\?\((.*?)\)$/u, "$1");
		const nested = /@.?([^?]*)[['](\??\(.*?\))(?!.\)\])[\]']/gu.exec(safeLoc);
		if (nested) this._walk(val, (m) => {
			const npath = [nested[2]];
			const nvalue = nested[1] ? val[m][nested[1]] : val[m];
			if (this._trace(npath, nvalue, path, parent, parentPropName, callback, true).length > 0) addRet(this._trace(x, val[m], push(path, m), val, m, callback, true));
		});
		else this._walk(val, (m) => {
			if (this._eval(safeLoc, val[m], m, path, parent, parentPropName)) addRet(this._trace(x, val[m], push(path, m), val, m, callback, true));
		});
	} else if (loc[0] === "(") {
		if (this.currEval === false) throw new Error("Eval [(expr)] prevented in JSONPath expression.");
		addRet(this._trace(unshift(this._eval(loc, val, path.at(-1), path.slice(0, -1), parent, parentPropName), x), val, path, parent, parentPropName, callback, hasArrExpr));
	} else if (loc[0] === "@") {
		let addType = false;
		const valueType = loc.slice(1, -2);
		switch (valueType) {
			case "scalar":
				if (!val || !["object", "function"].includes(typeof val)) addType = true;
				break;
			case "boolean":
			case "string":
			case "undefined":
			case "function":
				if (typeof val === valueType) addType = true;
				break;
			case "integer":
				if (Number.isFinite(val) && !(val % 1)) addType = true;
				break;
			case "number":
				if (Number.isFinite(val)) addType = true;
				break;
			case "nonFinite":
				if (typeof val === "number" && !Number.isFinite(val)) addType = true;
				break;
			case "object":
				if (val && typeof val === valueType) addType = true;
				break;
			case "array":
				if (Array.isArray(val)) addType = true;
				break;
			case "other":
				addType = this.currOtherTypeCallback(val, path, parent, parentPropName);
				break;
			case "null":
				if (val === null) addType = true;
				break;
			default: throw new TypeError("Unknown value type " + valueType);
		}
		if (addType) {
			retObj = {
				path,
				value: val,
				parent,
				parentProperty: parentPropName
			};
			this._handleCallback(retObj, callback, "value");
			return retObj;
		}
	} else if (loc[0] === "`" && val && Object.hasOwn(val, loc.slice(1))) {
		const locProp = loc.slice(1);
		addRet(this._trace(x, val[locProp], push(path, locProp), val, locProp, callback, hasArrExpr, true));
	} else if (loc.includes(",")) {
		const parts = loc.split(",");
		for (const part of parts) addRet(this._trace(unshift(part, x), val, path, parent, parentPropName, callback, true));
	} else if (!literalPriority && val && Object.hasOwn(val, loc)) addRet(this._trace(x, val[loc], push(path, loc), val, loc, callback, hasArrExpr, true));
	if (this._hasParentSelector) for (let t = 0; t < ret.length; t++) {
		const rett = ret[t];
		if (rett && rett.isParentSelector) {
			const tmp = this._trace(rett.expr, val, rett.path, parent, parentPropName, callback, hasArrExpr);
			if (Array.isArray(tmp)) {
				ret[t] = tmp[0];
				const tl = tmp.length;
				for (let tt = 1; tt < tl; tt++) {
					t++;
					ret.splice(t, 0, tmp[tt]);
				}
			} else ret[t] = tmp;
		}
	}
	return ret;
};
JSONPath.prototype._walk = function(val, f) {
	if (Array.isArray(val)) {
		const n = val.length;
		for (let i = 0; i < n; i++) f(i);
	} else if (val && typeof val === "object") Object.keys(val).forEach((m) => {
		f(m);
	});
};
JSONPath.prototype._slice = function(loc, expr, val, path, parent, parentPropName, callback) {
	if (!Array.isArray(val)) return;
	const len = val.length, parts = loc.split(":"), step = parts[2] && Number.parseInt(parts[2]) || 1;
	let start = parts[0] && Number.parseInt(parts[0]) || 0, end = parts[1] && Number.parseInt(parts[1]) || len;
	start = start < 0 ? Math.max(0, start + len) : Math.min(len, start);
	end = end < 0 ? Math.max(0, end + len) : Math.min(len, end);
	const ret = [];
	for (let i = start; i < end; i += step) this._trace(unshift(i, expr), val, path, parent, parentPropName, callback, true).forEach((t) => {
		ret.push(t);
	});
	return ret;
};
JSONPath.prototype._eval = function(code, _v, _vname, path, parent, parentPropName) {
	this.currSandbox._$_parentProperty = parentPropName;
	this.currSandbox._$_parent = parent;
	this.currSandbox._$_property = _vname;
	this.currSandbox._$_root = this.json;
	this.currSandbox._$_v = _v;
	const containsPath = code.includes("@path");
	if (containsPath) this.currSandbox._$_path = JSONPath.toPathString(path.concat([_vname]));
	const scriptCacheKey = this.currEval + "Script:" + code;
	if (!JSONPath.cache[scriptCacheKey]) {
		let script = code.replaceAll("@parentProperty", "_$_parentProperty").replaceAll("@parent", "_$_parent").replaceAll("@property", "_$_property").replaceAll("@root", "_$_root").replaceAll(/@([.\s)[])/gu, "_$_v$1");
		if (containsPath) script = script.replaceAll("@path", "_$_path");
		if (this.currEval === "safe" || this.currEval === true || this.currEval === void 0) JSONPath.cache[scriptCacheKey] = new this.safeVm.Script(script);
		else if (this.currEval === "native") JSONPath.cache[scriptCacheKey] = new this.vm.Script(script);
		else if (typeof this.currEval === "function" && this.currEval.prototype && Object.hasOwn(this.currEval.prototype, "runInNewContext")) {
			const CurrEval = this.currEval;
			JSONPath.cache[scriptCacheKey] = new CurrEval(script);
		} else if (typeof this.currEval === "function") JSONPath.cache[scriptCacheKey] = { runInNewContext: (context) => this.currEval(script, context) };
		else throw new TypeError(`Unknown "eval" property "${this.currEval}"`);
	}
	try {
		return JSONPath.cache[scriptCacheKey].runInNewContext(this.currSandbox);
	} catch (e) {
		if (this.ignoreEvalErrors) return false;
		throw new Error("jsonPath: " + e.message + ": " + code);
	}
};
JSONPath.cache = {};
/**
* @param {string[]} pathArr Array to convert
* @returns {string} The path string
*/
JSONPath.toPathString = function(pathArr) {
	const x = pathArr, n = x.length;
	let p = "$";
	for (let i = 1; i < n; i++) if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) p += /^[0-9*]+$/u.test(x[i]) ? "[" + x[i] + "]" : "['" + x[i] + "']";
	return p;
};
/**
* @param {string} pointer JSON Path
* @returns {string} JSON Pointer
*/
JSONPath.toPointer = function(pointer) {
	const x = pointer, n = x.length;
	let p = "";
	for (let i = 1; i < n; i++) if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) p += "/" + x[i].toString().replaceAll("~", "~0").replaceAll("/", "~1");
	return p;
};
/**
* @param {string} expr Expression to convert
* @returns {string[]}
*/
JSONPath.toPathArray = function(expr) {
	const { cache } = JSONPath;
	if (cache[expr]) return cache[expr].concat();
	const subx = [];
	cache[expr] = expr.replaceAll(/@(?:null|boolean|number|string|integer|undefined|nonFinite|scalar|array|object|function|other)\(\)/gu, ";$&;").replaceAll(/[['](\??\(.*?\))[\]'](?!.\])/gu, function($0, $1) {
		return "[#" + (subx.push($1) - 1) + "]";
	}).replaceAll(/\[['"]([^'\]]*)['"]\]/gu, function($0, prop) {
		return "['" + prop.replaceAll(".", "%@%").replaceAll("~", "%%@@%%") + "']";
	}).replaceAll("~", ";~;").replaceAll(/['"]?\.['"]?(?![^[]*\])|\[['"]?/gu, ";").replaceAll("%@%", ".").replaceAll("%%@@%%", "~").replaceAll(/(?:;)?(\^+)(?:;)?/gu, function($0, ups) {
		return ";" + ups.split("").join(";") + ";";
	}).replaceAll(/;;;|;;/gu, ";..;").replaceAll(/;$|'?\]|'$/gu, "").split(";").map(function(exp) {
		const match = exp.match(/#(\d+)/u);
		return !match || !match[1] ? exp : subx[match[1]];
	});
	return cache[expr].concat();
};
JSONPath.prototype.safeVm = { Script: SafeScript };
JSONPath.prototype.vm = vm.default;

//#endregion
//#region src/errors.ts
/** A value could not be converted. The value is left untouched; not user-facing. */
var StepError = class extends Error {
	name = "StepError";
};
/** A rule could not be parsed, or the payload was not JSON. Aborts the whole filter. */
var RuleError = class extends Error {
	name = "RuleError";
};

//#endregion
//#region src/decimal.ts
const DEC_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
/**
* Bounds the exponent accepted by `parseDec`. `10n ** BigInt(exponent)` is computed
* eagerly to normalise the value, so an unbounded exponent (e.g. a hostile response
* body) could force an astronomically large BigInt allocation. 10,000 comfortably
* covers real-world magnitudes (1e18 wei, ~1e77 for a 256-bit integer) while keeping
* that allocation cheap.
*/
const MAX_EXPONENT = 1e4;
function parseDec(input) {
	if (typeof input === "bigint") return {
		neg: input < 0n,
		digits: input < 0n ? -input : input,
		scale: 0
	};
	if (typeof input === "number" && Number.isInteger(input) && !Number.isSafeInteger(input)) throw new StepError(`not a safe integer: ${input}`);
	const text = typeof input === "number" ? String(input) : input;
	if (typeof text !== "string") throw new StepError(`not a number: ${String(input)}`);
	const m = DEC_PATTERN.exec(text.trim());
	if (m == null) throw new StepError(`not a number: ${text}`);
	const frac = m[3] ?? "";
	const exponent = m[4] != null ? Number.parseInt(m[4], 10) : 0;
	if (!Number.isFinite(exponent) || Math.abs(exponent) > MAX_EXPONENT) throw new StepError(`exponent out of range: ${m[4]}`);
	let digits = BigInt((m[2] ?? "0") + frac);
	let scale = frac.length - exponent;
	if (scale < 0) {
		digits *= 10n ** BigInt(-scale);
		scale = 0;
	}
	return {
		neg: m[1] === "-",
		digits,
		scale
	};
}
function mulDec(a, b) {
	return {
		neg: a.neg !== b.neg,
		digits: a.digits * b.digits,
		scale: a.scale + b.scale
	};
}
/** Half-up division. `precision` caps non-terminating quotients such as 1/3. */
function divDec(a, b, precision = 30) {
	if (b.digits === 0n) throw new StepError("division by zero");
	const digits = halfUp(a.digits * 10n ** BigInt(b.scale + precision), b.digits * 10n ** BigInt(a.scale));
	return {
		neg: a.neg !== b.neg,
		digits,
		scale: precision
	};
}
function roundDec(d, places) {
	if (!Number.isInteger(places) || places < 0) throw new StepError(`places must be a non-negative integer: ${places}`);
	if (places >= d.scale) return {
		...d,
		digits: d.digits * 10n ** BigInt(places - d.scale),
		scale: places
	};
	const divisor = 10n ** BigInt(d.scale - places);
	return {
		neg: d.neg,
		digits: halfUp(d.digits, divisor),
		scale: places
	};
}
function halfUp(numerator, denominator) {
	const quotient = numerator / denominator;
	return numerator % denominator * 2n >= denominator ? quotient + 1n : quotient;
}
/** "-0" is not a useful sign: only prefix "-" when the text has a nonzero digit. */
function withSign(neg, text) {
	return neg && /[1-9]/.test(text) ? `-${text}` : text;
}
function formatDec(d) {
	let text = withPoint(d.digits, d.scale);
	if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
	return withSign(d.neg, text);
}
function formatFixed(d, places) {
	const rounded = roundDec(d, places);
	const text = withPoint(rounded.digits, places);
	return withSign(rounded.neg, text);
}
function withPoint(digits, scale) {
	if (scale === 0) return digits.toString();
	const padded = digits.toString().padStart(scale + 1, "0");
	return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

//#endregion
//#region src/steps.ts
/** Mirrors decimal.ts's MAX_EXPONENT: a four-figure decimal-places cap is far
* beyond any legitimate use, and keeps `fixed`'s `10n ** BigInt(places)` cheap. */
const MAX_PLACES = 1e4;
/** Coerce to a BigInt integer, rejecting anything fractional, non-numeric, or an
* unsafe (float-corrupted) JS number. Integral strings and bigints have no such
* ceiling — they can carry arbitrarily large exact values. */
function toInteger(value) {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new StepError(`not a safe integer: ${value}`);
		return BigInt(value);
	}
	if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return BigInt(value.trim());
	throw new StepError(`not an integer: ${String(value)}`);
}
/** Prefixes/patterns for every base parseRadix knows about, used to detect a
* literal wearing another base's prefix (e.g. "0b1010" handed to hex>dec). */
const RADIX_PREFIXES = [
	{
		prefix: "0x",
		pattern: /^[0-9a-f]+$/
	},
	{
		prefix: "0b",
		pattern: /^[01]+$/
	},
	{
		prefix: "0o",
		pattern: /^[0-7]+$/
	}
];
function parseRadix(value, radix, prefix, pattern) {
	if (typeof value !== "string") throw new StepError(`not a string: ${String(value)}`);
	const trimmed = value.trim().toLowerCase();
	const negative = trimmed.startsWith("-");
	const raw = negative ? trimmed.slice(1) : trimmed;
	for (const foreign of RADIX_PREFIXES) {
		if (foreign.prefix === prefix) continue;
		if (raw.startsWith(foreign.prefix) && foreign.pattern.test(raw.slice(foreign.prefix.length))) throw new StepError(`not base-${radix}: ${value}`);
	}
	const body = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
	if (body.length === 0 || !pattern.test(body)) throw new StepError(`not base-${radix}: ${value}`);
	const result = BigInt(`${prefix}${body}`);
	return negative ? -result : result;
}
/** Render a BigInt in another base with the sign outside the prefix, e.g.
* -255n -> "-0xff" rather than the malformed, non-round-trippable "0x-ff". */
function formatRadix(n, radix, prefix) {
	return `${n < 0n ? "-" : ""}${prefix}${(n < 0n ? -n : n).toString(radix)}`;
}
/** ISO 8601 in UTC, omitting the milliseconds component when it is zero. */
function isoFromMs(ms) {
	const asNumber = Number(ms);
	if (!Number.isSafeInteger(asNumber)) throw new StepError(`timestamp out of range: ${ms}`);
	const date = new Date(asNumber);
	if (Number.isNaN(date.getTime())) throw new StepError(`timestamp out of range: ${ms}`);
	const iso = date.toISOString();
	return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}
/** Strict ISO 8601 date-only form: "YYYY-MM-DD". ECMA-262 defines this shape
* as UTC (unlike a bare "YYYY-MM-DDTHH:mm" with no offset, which resolves to
* host-local time and so is deliberately rejected below), and it is the most
* common date shape in real JSON payloads, so it is accepted on its own. */
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Strict ISO 8601 UTC instant: "YYYY-MM-DDTHH:mm:ss(.sss)(Z|+HH:MM|-HH:MM)".
* An explicit offset (literal "Z" or a numeric "+HH:MM"/"-HH:MM") is
* mandatory, so date>epoch_s/date>epoch_ms never have to guess at a
* datetime's meaning the way a bare "YYYY-MM-DDTHH:mm" (host-local time)
* would force them to. */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function daysInMonth(year, month) {
	if (month === 2) return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0 ? 29 : 28;
	return [
		31,
		28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	][month - 1];
}
/** Validate year/month/day by hand rather than trusting Date.UTC, which
* silently rolls an invalid calendar date over into a different, valid one
* (e.g. "2025-02-30" becomes 2025-03-02) instead of rejecting it. */
function assertValidCalendarDate(year, month, day, value) {
	if (month < 1 || month > 12) throw new StepError(`invalid month: ${value}`);
	if (day < 1 || day > daysInMonth(year, month)) throw new StepError(`invalid day: ${value}`);
}
/** Parse a strict ISO date or instant string to milliseconds since the epoch.
*
* Date.parse is lenient and implementation-defined for anything short of a
* full instant, so parsing is done entirely by hand from a matched regex:
* every field (calendar date, time-of-day, UTC offset) is range-checked
* before Date.UTC ever sees it, so its silent-overflow behaviour never gets
* a chance to fire. */
function msFromDate(value) {
	if (typeof value !== "string") throw new StepError(`not a date string: ${String(value)}`);
	const trimmed = value.trim();
	const dateOnly = ISO_DATE_ONLY.exec(trimmed);
	if (dateOnly != null) {
		const year$1 = Number(dateOnly[1]);
		const month$1 = Number(dateOnly[2]);
		const day$1 = Number(dateOnly[3]);
		assertValidCalendarDate(year$1, month$1, day$1, value);
		return BigInt(Date.UTC(year$1, month$1 - 1, day$1));
	}
	const match = ISO_INSTANT.exec(trimmed);
	if (match == null) throw new StepError(`not an ISO 8601 date: ${value}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6]);
	const ms = match[7] == null ? 0 : Number(match[7]);
	assertValidCalendarDate(year, month, day, value);
	if (hour > 23 || minute > 59 || second > 59) throw new StepError(`invalid time: ${value}`);
	let offsetMs = 0n;
	const offsetSign = match[8];
	if (offsetSign != null) {
		const offsetHour = Number(match[9]);
		const offsetMinute = Number(match[10]);
		if (offsetHour > 23 || offsetMinute > 59) throw new StepError(`invalid UTC offset: ${value}`);
		const magnitude = BigInt(offsetHour) * 3600000n + BigInt(offsetMinute) * 60000n;
		offsetMs = offsetSign === "-" ? -magnitude : magnitude;
	}
	return BigInt(Date.UTC(year, month - 1, day, hour, minute, second, ms)) - offsetMs;
}
/** BigInt division that rounds toward negative infinity (floor), not toward
* zero. `date>epoch_s` truncates sub-second precision by design, so it must
* floor: for a negative instant like -500ms (1969-12-31T23:59:59.500Z),
* truncating division gives 0 (1970-01-01T00:00:00 — the wrong second
* entirely), while flooring gives -1 (1969-12-31T23:59:59 — the second the
* instant actually falls in). `divisor` is always the positive 1000n here. */
function floorDivBigInt(dividend, divisor) {
	const quotient = dividend / divisor;
	const remainder = dividend % divisor;
	return remainder !== 0n && remainder < 0n !== divisor < 0n ? quotient - 1n : quotient;
}
const DURATION_UNITS = [
	["d", 86400000n],
	["h", 3600000n],
	["m", 60000n],
	["s", 1000n]
];
function toText(value) {
	if (typeof value !== "string") throw new StepError(`not a string: ${String(value)}`);
	return value;
}
/** Matches a lone (unpaired) UTF-16 surrogate: a high surrogate (D800-DBFF)
* not immediately followed by a low surrogate (DC00-DFFF), or a low
* surrogate not immediately preceded by a high one. A *paired* surrogate
* (e.g. any emoji) matches neither branch, since each half's lookaround
* finds its partner right where it should be. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** A lone surrogate has no valid UTF-8 encoding of its own; Buffer.from
* silently substitutes U+FFFD for it instead of failing, which would
* silently corrupt every encode step's output. JSON.parse('"\ud800"') is
* valid JSON, so this is realistic input, not a theoretical edge case --
* reject it explicitly instead of letting it through. */
function assertNoLoneSurrogate(text) {
	if (LONE_SURROGATE.test(text)) throw new StepError(`text contains an unpaired UTF-16 surrogate: ${text}`);
	return text;
}
/** Buffer.from tolerates malformed padding ("QQ=" decodes the same as "QQ=="
* or "QQ") and silently drops whitespace/newlines and non-alphabet junk
* instead of failing on them. Locking the shape down to exactly two
* legitimate forms -- fully padded, or fully unpadded -- rejects that
* garbage before it ever reaches Buffer.from, while still accepting either
* padding convention as a genuine encoding. */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/;
const BASE64URL_PATTERN = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/;
/** BASE64_PATTERN/BASE64URL_PATTERN's nested quantifiers make V8 recurse
* proportionally to input length; measured empirically, `.test()` throws a
* raw RangeError ("Maximum call stack size exceeded") somewhere between
* 4,468,750 and 4,476,562 characters. 2,000,000 leaves more than 2x headroom
* below that measured breakpoint while comfortably fitting any real base64
* payload (a multi-megabyte encoded blob in an API response is normal; a
* multi-million-character one is not), and it applies uniformly to hex too
* so all four decode-family steps (`base64`, `base64url`, `hexbytes`, and
* `jwt`, which decodes its segments through this same function) share one
* bound instead of hex being an unbounded exception. */
const MAX_DECODE_LENGTH = 2e6;
/** Buffer.from is lenient about junk; round-trip to prove the input was really valid. */
function decodeStrict(value, encoding) {
	const text = toText(value);
	if (text.length > MAX_DECODE_LENGTH) throw new StepError(`input too large to decode (max ${MAX_DECODE_LENGTH} characters): ${text.length}`);
	const stripped = text.toLowerCase().startsWith("0x") && encoding === "hex" ? text.slice(2) : text;
	const body = encoding === "hex" ? stripped.toLowerCase() : stripped;
	const pattern = encoding === "base64" ? BASE64_PATTERN : encoding === "base64url" ? BASE64URL_PATTERN : null;
	if (pattern != null && !pattern.test(body)) throw new StepError(`not valid ${encoding}: ${text}`);
	const buffer = Buffer.from(body, encoding);
	if (buffer.toString(encoding).replace(/=+$/, "") !== body.replace(/=+$/, "")) throw new StepError(`not valid ${encoding}: ${text}`);
	const decoded = buffer.toString("utf8");
	if (!Buffer.from(decoded, "utf8").equals(buffer)) throw new StepError(`decoded ${encoding} is not valid utf-8 text: ${text}`);
	return decoded;
}
/** JSON.parse throws a raw SyntaxError; wrap it so a malformed payload never
* escapes as anything but a StepError, and so the message names what failed. */
function parseJson(text, what) {
	try {
		return JSON.parse(text);
	} catch {
		throw new StepError(`not valid JSON in ${what}`);
	}
}
const STEPS = {
	"hex>dec": {
		arity: 0,
		run: (v) => parseRadix(v, 16, "0x", /^[0-9a-f]+$/)
	},
	"bin>dec": {
		arity: 0,
		run: (v) => parseRadix(v, 2, "0b", /^[01]+$/)
	},
	"oct>dec": {
		arity: 0,
		run: (v) => parseRadix(v, 8, "0o", /^[0-7]+$/)
	},
	"dec>hex": {
		arity: 0,
		run: (v) => formatRadix(toInteger(v), 16, "0x")
	},
	"dec>bin": {
		arity: 0,
		run: (v) => formatRadix(toInteger(v), 2, "0b")
	},
	"dec>oct": {
		arity: 0,
		run: (v) => formatRadix(toInteger(v), 8, "0o")
	},
	div: {
		arity: 1,
		run: (v, [n]) => formatDec(divDec(parseDec(v), parseDec(n)))
	},
	mul: {
		arity: 1,
		run: (v, [n]) => formatDec(mulDec(parseDec(v), parseDec(n)))
	},
	fixed: {
		arity: 1,
		run: (v, [n]) => {
			const raw = String(n).trim();
			if (!/^\d+$/.test(raw)) throw new StepError(`fixed requires a non-negative integer, got: ${String(n)}`);
			const places = Number.parseInt(raw, 10);
			if (places > MAX_PLACES) throw new StepError(`fixed places too large (max ${MAX_PLACES}): ${raw}`);
			return formatFixed(parseDec(v), places);
		}
	},
	"epoch_s>date": {
		arity: 0,
		run: (v) => isoFromMs(toInteger(v) * 1000n)
	},
	"epoch_ms>date": {
		arity: 0,
		run: (v) => isoFromMs(toInteger(v))
	},
	"date>epoch_s": {
		arity: 0,
		run: (v) => floorDivBigInt(msFromDate(v), 1000n)
	},
	"date>epoch_ms": {
		arity: 0,
		run: (v) => msFromDate(v)
	},
	"ms>duration": {
		arity: 0,
		run: (v) => {
			let remaining = toInteger(v);
			if (remaining < 0n) throw new StepError(`negative duration: ${remaining}`);
			const parts = [];
			for (const [label, size] of DURATION_UNITS) {
				const count = remaining / size;
				if (count > 0n) {
					parts.push(`${count}${label}`);
					remaining %= size;
				}
			}
			if (remaining > 0n || parts.length === 0) parts.push(`${remaining}ms`);
			return parts.join(" ");
		}
	},
	base64: {
		arity: 0,
		run: (v) => decodeStrict(v, "base64")
	},
	base64url: {
		arity: 0,
		run: (v) => decodeStrict(v, "base64url")
	},
	hexbytes: {
		arity: 0,
		run: (v) => decodeStrict(v, "hex")
	},
	urlenc: {
		arity: 0,
		run: (v) => {
			const text = toText(v);
			try {
				return decodeURIComponent(text);
			} catch {
				throw new StepError(`not valid url encoding: ${String(v)}`);
			}
		}
	},
	"text>base64": {
		arity: 0,
		run: (v) => Buffer.from(assertNoLoneSurrogate(toText(v)), "utf8").toString("base64")
	},
	"text>base64url": {
		arity: 0,
		run: (v) => Buffer.from(assertNoLoneSurrogate(toText(v)), "utf8").toString("base64url")
	},
	"text>hexbytes": {
		arity: 0,
		run: (v) => `0x${Buffer.from(assertNoLoneSurrogate(toText(v)), "utf8").toString("hex")}`
	},
	"text>urlenc": {
		arity: 0,
		run: (v) => {
			const text = assertNoLoneSurrogate(toText(v));
			try {
				return encodeURIComponent(text);
			} catch {
				throw new StepError(`not valid text for url encoding: ${String(v)}`);
			}
		}
	},
	json: {
		arity: 0,
		run: (v) => parseJson(toText(v), "value")
	},
	jwt: {
		arity: 0,
		run: (v) => {
			const segments = toText(v).split(".");
			if (segments.length !== 3) throw new StepError(`not a JWT: expected 3 segments, got ${segments.length}`);
			return {
				header: parseJson(decodeStrict(segments[0], "base64url"), "JWT header"),
				payload: parseJson(decodeStrict(segments[1], "base64url"), "JWT payload")
			};
		}
	}
};
function runStep(name, value, args) {
	const step = STEPS[name];
	if (step == null) throw new StepError(`unknown step: ${name}`);
	return step.run(value, args);
}

//#endregion
//#region src/apply.ts
function applyRules(root, rules) {
	let current = root;
	let converted = 0;
	let matched = 0;
	for (const rule of rules) {
		let matches;
		try {
			const result = JSONPath({
				path: rule.selector,
				json: current,
				resultType: "all"
			});
			matches = Array.isArray(result) ? result : [];
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			throw new RuleError(`invalid selector "${rule.selector}": ${detail}`);
		}
		matched += matches.length;
		for (const match of matches) {
			let value = match.value;
			try {
				for (const step of rule.steps) value = runStep(step.name, value, step.args);
			} catch (err) {
				if (err instanceof StepError) continue;
				throw err;
			}
			if (match.parentProperty == null) current = value;
			else match.parent[match.parentProperty] = value;
			converted += 1;
		}
	}
	return {
		value: current,
		converted,
		matched
	};
}
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** BigInt cannot be serialised by JSON.stringify, so it is narrowed here. */
function serialise(value) {
	return JSON.stringify(value, (_key, v) => {
		if (typeof v !== "bigint") return v;
		return v <= MAX_SAFE && v >= -MAX_SAFE ? Number(v) : v.toString();
	}, 2);
}

//#endregion
//#region src/conversionTypes.ts
/**
* Steps that take a numeric argument rather than converting between two
* representations. These are surfaced in the Simple form as the Then/Amount
* controls, never as a From or To option.
*/
const NON_CONVERSION_STEPS = new Set([
	"div",
	"mul",
	"fixed"
]);
/**
* Bare-named steps (no `>` in the name) that decode FROM the labelled
* encoding INTO text. Their own step name doubles as the token looked up in
* TOKEN_LABELS below, so the label is never hand-duplicated here.
*/
const DECODE_ALIAS_STEPS = new Set([
	"base64",
	"base64url",
	"hexbytes",
	"urlenc"
]);
/**
* Structured steps whose name gives no hint at all about its from/to shape
* (unlike e.g. `hex>dec`, there is no token to derive a label from), so the
* pair is spelled out explicitly. This is the minimum irreducible knowledge
* needed for these two steps -- everything else in this module is derived
* from `STEPS`'s own keys.
*/
const STRUCTURED_EDGES = {
	json: {
		from: "JSON string",
		to: "value"
	},
	jwt: {
		from: "JWT",
		to: "claims"
	}
};
/**
* Human-readable labels for every token that appears on either side of an
* `a>b`-named step, plus the decode-alias step names themselves (looked up
* by their own name, since those steps have no `>`). `ms` and `epoch_ms`
* deliberately share a label: both denote "a number of milliseconds", one as
* a timestamp (`epoch_ms>date`) and one as a plain duration count
* (`ms>duration`).
*/
const TOKEN_LABELS = {
	hex: "hex",
	dec: "decimal",
	bin: "binary",
	oct: "octal",
	epoch_s: "epoch seconds",
	epoch_ms: "epoch millis",
	ms: "epoch millis",
	date: "ISO date",
	duration: "duration",
	text: "text",
	base64: "base64",
	base64url: "base64url",
	hexbytes: "hex bytes",
	urlenc: "URL-encoded"
};
/**
* Overrides the DISPLAYED label for a handful of internal type ids whose
* plain name reads as ambiguous next to a similarly-worded sibling --
* `hex` (a base-16 *number*) sitting beside `hex bytes` (a hex-encoded
* *byte string* that decodes to text) is the motivating case (#19 review):
* a user who has never read the README could easily pick the wrong one and
* get a nonsensical result. This is a display-only layer: `CONVERSION_EDGES`,
* `toOptionsFor`'s filtering, `FormInputSelectOption.value`, and everything
* persisted to the store all keep using the plain id (`"hex"`, `"hex
* bytes"`, ...) below -- only the text shown in the dropdown changes, so
* this never invalidates a previously-saved selection.
*/
const DISPLAY_LABEL_OVERRIDES = {
	hex: "hex number",
	"hex bytes": "hex bytes (text)"
};
function displayLabel(id) {
	return DISPLAY_LABEL_OVERRIDES[id] ?? id;
}
/**
* Derives every from->to conversion edge straight from `STEPS`'s own keys,
* so the Simple-mode form can never silently drop a step as the registry
* grows: a step this module doesn't know how to label throws immediately at
* import time (surfaced by a test, not a silently-missing dropdown entry).
*/
function deriveEdges() {
	const edges = [];
	for (const step of Object.keys(STEPS)) {
		if (NON_CONVERSION_STEPS.has(step)) continue;
		const structured = STRUCTURED_EDGES[step];
		if (structured != null) {
			edges.push({
				step,
				from: structured.from,
				to: structured.to
			});
			continue;
		}
		if (DECODE_ALIAS_STEPS.has(step)) {
			const label = TOKEN_LABELS[step];
			if (label == null) throw new Error(`filter-convert: no label for decode-alias step "${step}"`);
			edges.push({
				step,
				from: label,
				to: "text"
			});
			continue;
		}
		const arrow = step.indexOf(">");
		if (arrow === -1) throw new Error(`filter-convert: step "${step}" has no known from/to mapping for the Simple form`);
		const fromToken = step.slice(0, arrow);
		const toToken = step.slice(arrow + 1);
		const from = TOKEN_LABELS[fromToken];
		const to = TOKEN_LABELS[toToken];
		if (from == null || to == null) {
			const badToken = from == null ? fromToken : toToken;
			throw new Error(`filter-convert: no label for token "${badToken}" in step "${step}"`);
		}
		edges.push({
			step,
			from,
			to
		});
	}
	return edges;
}
/** Every from->to conversion edge, derived from the registry -- never hand-maintained. */
const CONVERSION_EDGES = deriveEdges();
const EDGE_BY_STEP = new Map(CONVERSION_EDGES.map((e) => [e.step, e]));
/** Looks up the From/To edge for a conversion step name (e.g. `"hex>dec"`),
* or `undefined` if the step isn't a conversion step at all (div/mul/fixed,
* or anything unregistered). Used to figure out whether a legacy DSL rule's
* first step can be represented in the Simple form. */
function edgeForStep(step) {
	return EDGE_BY_STEP.get(step);
}
/** From options for the Simple-mode select, in registry-discovery order,
* deduplicated. `value` is the stable internal id (also what's persisted to
* the store); `label` is the possibly-overridden display text. */
const FROM_OPTIONS = (() => {
	const seen = /* @__PURE__ */ new Set();
	const options = [];
	for (const edge of CONVERSION_EDGES) {
		if (seen.has(edge.from)) continue;
		seen.add(edge.from);
		options.push({
			label: displayLabel(edge.from),
			value: edge.from
		});
	}
	return options;
})();
/** To options for a given From id. The option's `value` is the step name
* itself, so picking a To option fully determines which step to run --
* there is no separate from+to -> step lookup to keep in sync. `label` is
* the possibly-overridden display text for the To id. */
function toOptionsFor(from) {
	return CONVERSION_EDGES.filter((e) => e.from === from).map((e) => ({
		label: displayLabel(e.to),
		value: e.step
	}));
}
const firstFrom = FROM_OPTIONS[0];
if (firstFrom == null) throw new Error("filter-convert: no conversion steps registered");
/** The Simple form's default From, matching the plugin's historical default rule. */
const DEFAULT_FROM = firstFrom.value;
const firstTo = toOptionsFor(DEFAULT_FROM)[0];
if (firstTo == null) throw new Error(`filter-convert: no To options for default From "${DEFAULT_FROM}"`);
/** The Simple form's default To (a step name), matching the plugin's historical default rule. */
const DEFAULT_TO_STEP = firstTo.value;

//#endregion
//#region src/dsl.ts
/**
* Split a rule line on `|` characters that sit outside brackets, parentheses
* and quotes. JSONPath filters legitimately contain `||`, as in
* `$[?(@.a || @.b)]`, and bracket-notation properties may themselves contain
* a literal `|`, as in `$['a|b']` or `$["a|b"]`.
*
* Bracket/paren nesting is tracked with a single depth counter, not a stack
* of bracket kinds, and this is NOT a JSONPath validator -- it only finds
* pipes that sit outside any bracket/paren/quote. Two known consequences of
* that narrowness, both deliberately accepted rather than fixed here:
*
* - A pathological selector whose brackets net to zero depth despite being
*   mismatched (e.g. a stray `)(`) is not caught here -- it is left for
*   apply.ts's jsonpath-plus call to reject at evaluation time.
* - More subtly, a *genuinely balanced* bracket or paren that appears before
*   the pipe the user actually intended as the selector/step separator will
*   absorb that pipe too, e.g. `$.a( | hex>dec ) | fixed 2` parses as
*   selector `$.a( | hex>dec )` with the single step `fixed 2` -- the
*   `hex>dec` step is silently swallowed into the selector text with no
*   parser diagnostic. This is intentionally not treated as an error: the
*   parser cannot know which pipe the user meant, and full JSONPath grammar
*   validation (which alone could tell "real" filter syntax from stray
*   punctuation) is out of scope for a module whose only job is splitting on
*   pipes. The consequence is bounded and safe rather than silently wrong:
*   `|` is not valid JSONPath outside a filter expression, so a mangled
*   selector like `$.a( | hex>dec )` is not valid JSONPath either. Rather
*   than throwing, jsonpath-plus returns an empty match set for it, so
*   the action reports "No values matched — check the selector" -- the
*   user is told to look at the right thing, even though the parser itself
*   stayed silent.
*
* What *is* caught here, because it would otherwise silently swallow the
* rest of the line (including every step) into the selector with no
* downstream signal at all, is a selector whose depth never returns to
* zero, or a quote that never closes.
*
* Inside a quoted section, a backslash escapes the next character so it
* cannot prematurely close the quote, e.g. `$['a\'b']`. This is a
* deliberate choice, mirroring ordinary string-escaping convention: without
* it, an escaped quote inside bracket notation would flip the scanner's
* quote state early and corrupt the split.
*/
function splitTopLevel(line) {
	const chars = Array.from(line);
	const parts = [];
	let current = "";
	let depth = 0;
	let quote = null;
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i];
		if (ch === void 0) continue;
		if (quote != null) {
			if (ch === "\\" && i + 1 < chars.length) {
				const next = chars[i + 1];
				current += ch + (next ?? "");
				i += 1;
				continue;
			}
			if (ch === quote) quote = null;
			current += ch;
			continue;
		}
		if (ch === "'" || ch === "\"") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === "[" || ch === "(") depth += 1;
		if (ch === "]" || ch === ")") depth -= 1;
		if (ch === "|" && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	parts.push(current);
	if (quote != null) throw new RuleError(`unterminated quote in rule: ${line}`);
	if (depth !== 0) throw new RuleError(`unbalanced brackets or parentheses in rule: ${line}`);
	return parts;
}
function parseRules(text) {
	const rules = [];
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const [selectorPart, ...stepParts] = splitTopLevel(line);
		const selector = (selectorPart ?? "").trim();
		if (selector === "") throw new RuleError(`empty selector in rule: ${line}`);
		if (stepParts.length === 0) throw new RuleError(`no step given in rule: ${line}`);
		const steps = stepParts.map((part) => parseStep(part.trim(), line));
		rules.push({
			selector,
			steps
		});
	}
	return rules;
}
function parseStep(text, line) {
	if (text === "") throw new RuleError(`empty step in rule: ${line}`);
	const [name, ...args] = text.split(/\s+/);
	const step = STEPS[name ?? ""];
	if (step == null) throw new RuleError(`unknown step "${name}" in rule: ${line}`);
	if (args.length !== step.arity) {
		const plural = step.arity === 1 ? "argument" : "arguments";
		throw new RuleError(`step "${name}" expects ${step.arity} ${plural}, got ${args.length} in rule: ${line}`);
	}
	return {
		name: name ?? "",
		args
	};
}

//#endregion
//#region src/action.ts
const BOM = /^\uFEFF/;
const storeKey = (requestId) => `rules:${requestId}`;
const PLACEHOLDER = ["$.result | hex>dec", "$..value | hex>dec | div 1e18"].join("\n");
const DEFAULT_STATE = {
	mode: "simple",
	field: "$.result",
	from: DEFAULT_FROM,
	to: DEFAULT_TO_STEP,
	then: "none",
	amount: "",
	rules: ""
};
const MODE_OPTIONS = [{
	label: "Simple",
	value: "simple"
}, {
	label: "Advanced",
	value: "advanced"
}];
const THEN_OPTIONS = [
	{
		label: "none",
		value: "none"
	},
	{
		label: "divide by",
		value: "div"
	},
	{
		label: "multiply by",
		value: "mul"
	},
	{
		label: "round to N places",
		value: "fixed"
	}
];
function isThenOp(value) {
	return value === "none" || value === "div" || value === "mul" || value === "fixed";
}
function isValidFrom(value) {
	return typeof value === "string" && FROM_OPTIONS.some((o) => o.value === value);
}
/**
* Groups every step actually registered in `STEPS` into families for the
* reference card shown above the rules editor, so the list can never drift
* from what the DSL really supports. Each pattern is checked in order and a
* step is claimed by the first family it matches; anything left over (e.g. a
* future step that doesn't fit an existing family) still gets listed under
* "other" rather than silently vanishing from the reference.
*/
const STEP_FAMILIES = [
	{
		label: "numeric base",
		match: (n) => /^(hex|bin|oct|dec)>/.test(n)
	},
	{
		label: "scaling",
		match: (n) => n === "div" || n === "mul" || n === "fixed"
	},
	{
		label: "time",
		match: (n) => /(epoch|date|duration)/.test(n)
	},
	{
		label: "encoding",
		match: (n) => /(base64|hexbytes|urlenc)/.test(n)
	},
	{
		label: "structured",
		match: (n) => n === "json" || n === "jwt"
	}
];
/**
* Renders a step for the reference card with its argument placeholders
* inline (e.g. `div <n>`), derived from the registry's own `arity` rather
* than a hardcoded list of "which steps take an argument" -- so this stays
* honest if a step's arity ever changes.
*
* Every name is wrapped in backticks so it renders as an inline code span.
* This is not just cosmetic: Yaak renders this markdown with react-markdown
* + remark-gfm and no rehype-raw, so a bare `<n>` outside a code span is
* parsed as an (unrecognised) raw HTML tag and silently dropped -- the
* arity hint would vanish from the UI entirely, leaving "div , fixed , mul"
* with a dangling space. Backticks sidestep that for every step, including
* zero-arity ones, since they read better and stay future-proof if a step's
* arity ever changes to include a placeholder.
*/
function formatStepName(name) {
	const arity = STEPS[name]?.arity ?? 0;
	if (arity === 0) return `\`${name}\``;
	if (arity === 1) return `\`${name} <n>\``;
	return `\`${name} ${Array.from({ length: arity }, (_, i) => `<arg${i + 1}>`).join(" ")}\``;
}
/**
* The GENERATED half of the reference card -- every step in `STEPS`,
* grouped by family, with no hand-written text. Exported separately (rather
* than folded straight into the full card) so a drift-guard test can assert
* a step name appears in *this* string specifically. Asserting against the
* full card (generated sections + hand-written examples) would be a weaker
* guard: `hex>dec` and `jwt` also happen to appear in the examples below, so
* a substring check over the whole card could pass even if the generator
* silently dropped them from the generated sections.
*/
function buildStepFamilySections() {
	const remaining = new Set(Object.keys(STEPS));
	const lines = [];
	for (const { label, match } of STEP_FAMILIES) {
		const names = Array.from(remaining).filter(match).sort();
		if (names.length === 0) continue;
		names.forEach((n) => remaining.delete(n));
		lines.push(`- **${label}**: ${names.map(formatStepName).join(", ")}`);
	}
	if (remaining.size > 0) {
		const leftover = Array.from(remaining).sort();
		lines.push(`- **other**: ${leftover.map(formatStepName).join(", ")}`);
	}
	return lines.join("\n");
}
const STEP_FAMILY_SECTIONS = buildStepFamilySections();
function buildStepReference() {
	return [
		"One rule per line: `$.path | step | step`",
		"",
		STEP_FAMILY_SECTIONS,
		"",
		"Examples:",
		"- `$.result | hex>dec`",
		"- `$..value | hex>dec | div 1e18`",
		"- `$.payload | base64 | json`",
		"- `$.token | jwt`"
	].join("\n");
}
const STEP_REFERENCE = buildStepReference();
/**
* Attempts to represent a legacy (pre-#19) DSL string as Simple-mode field
* values. Reuses `parseRules` rather than writing a second parser -- it
* already owns step-name/arity validation, and a `RuleError` from it simply
* means "not representable in Simple, fall back to Advanced", not a crash.
*
* Returns `null` (meaning: stay in Advanced) unless ALL of these hold:
* - the text is exactly one rule (one non-comment, non-blank line)
* - that rule's first step is a registered from/to conversion step
* - the rule has either no second step, or exactly one second step that is
*   `div`/`mul`/`fixed` with its single (already arity-checked) argument
*
* Anything else -- multiple rules, a chain of two or more conversions, an
* unmappable first step -- is out of Simple mode's reach and stays Advanced.
*/
function tryMigrateLegacyToSimple(rulesText) {
	let parsed;
	try {
		parsed = parseRules(rulesText);
	} catch (err) {
		if (err instanceof RuleError) return null;
		throw err;
	}
	if (parsed.length !== 1) return null;
	const rule = parsed[0];
	if (rule == null) return null;
	const [first, second, ...rest] = rule.steps;
	if (first == null || rest.length > 0) return null;
	const edge = edgeForStep(first.name);
	if (edge == null) return null;
	if (second == null) return {
		field: rule.selector,
		from: edge.from,
		to: edge.step,
		then: "none",
		amount: ""
	};
	if (second.name !== "div" && second.name !== "mul" && second.name !== "fixed") return null;
	const amount = second.args[0];
	if (amount == null) return null;
	return {
		field: rule.selector,
		from: edge.from,
		to: edge.step,
		then: second.name,
		amount
	};
}
/**
* Normalises whatever is under the store key into a full `FormState`.
*
* A pre-#19 saved entry is a plain DSL string. If it can be represented in
* Simple mode (see `tryMigrateLegacyToSimple`), it migrates there directly
* -- most legacy rules were exactly this shape, and defaulting them all into
* Advanced made Simple mode effectively unreachable for anyone who'd used
* the plugin before #19 landed. Only a rule Simple genuinely cannot express
* falls back to Advanced. Either way the original text is kept in `rules`
* unchanged, so switching to Advanced (or Simple mode failing to reproduce
* it for any reason) never loses it. Anything else unexpected (corrupt
* data, a future schema change) falls back field-by-field to
* `DEFAULT_STATE` rather than being treated as a hard failure.
*/
function normalizeSaved(raw) {
	if (typeof raw === "string") {
		const migrated = tryMigrateLegacyToSimple(raw);
		if (migrated != null) return {
			...DEFAULT_STATE,
			...migrated,
			mode: "simple",
			rules: raw
		};
		return {
			...DEFAULT_STATE,
			mode: "advanced",
			rules: raw
		};
	}
	if (raw != null && typeof raw === "object") {
		const obj = raw;
		const from = isValidFrom(obj.from) ? obj.from : DEFAULT_STATE.from;
		const requestedTo = typeof obj.to === "string" ? obj.to : DEFAULT_STATE.to;
		const validTo = toOptionsFor(from);
		const to = validTo.some((o) => o.value === requestedTo) ? requestedTo : validTo[0]?.value ?? DEFAULT_STATE.to;
		return {
			mode: obj.mode === "advanced" ? "advanced" : "simple",
			field: typeof obj.field === "string" ? obj.field : DEFAULT_STATE.field,
			from,
			to,
			then: isThenOp(obj.then) ? obj.then : DEFAULT_STATE.then,
			amount: typeof obj.amount === "string" ? obj.amount : DEFAULT_STATE.amount,
			rules: typeof obj.rules === "string" ? obj.rules : DEFAULT_STATE.rules
		};
	}
	return DEFAULT_STATE;
}
/**
* Resolves one field of the confirmed (or in-flight, for `dynamic`) form
* values against the saved state: an edited field (present in `values`,
* even as `""`) wins; an untouched one (absent) falls back to what the
* dialog was actually showing (`saved`), never to a blank. This is the
* per-field trap the whole form has to get right -- see #19 and #17.
*/
function resolveString(values, name, fallback) {
	const value = values[name];
	return typeof value === "string" ? value : fallback;
}
/**
* Resolves the full live state of the form from whatever partial values are
* currently known (either the final confirmed values, or the in-progress
* values `dynamic` is re-evaluated against) plus the saved state as the
* per-field fallback. Also re-validates `to` against the resolved `from`:
* if the user just changed From, a stale To value from before the change is
* replaced with the first option valid for the new From, rather than being
* carried forward as a mismatched pair.
*/
function resolveLiveState(values, saved) {
	const mode = resolveString(values, "mode", saved.mode) === "advanced" ? "advanced" : "simple";
	const field = resolveString(values, "field", saved.field);
	const fromRaw = resolveString(values, "from", saved.from);
	const from = isValidFrom(fromRaw) ? fromRaw : DEFAULT_FROM;
	const validTo = toOptionsFor(from);
	const requestedTo = resolveString(values, "to", saved.to);
	const to = validTo.some((o) => o.value === requestedTo) ? requestedTo : validTo[0]?.value ?? DEFAULT_TO_STEP;
	const thenRaw = resolveString(values, "then", saved.then);
	return {
		mode,
		field,
		from,
		to,
		then: isThenOp(thenRaw) ? thenRaw : "none",
		amount: resolveString(values, "amount", saved.amount),
		rules: resolveString(values, "rules", saved.rules)
	};
}
/** Composes the Simple-mode selections into exactly one DSL rule, fed
* through the same `parseRules`/`applyRules` engine Advanced mode uses --
* there is no second execution path. */
function buildSimpleRuleText(state) {
	let rule = `${state.field} | ${state.to}`;
	if (state.then !== "none") rule += ` | ${state.then} ${state.amount}`;
	return rule;
}
/**
* Yaak's real `DynamicPromptFormArg` type attaches `dynamic` to each
* individual input, not once to the whole form: every re-evaluation gets
* the form's full live `values` map, but may only return a partial update
* to the ONE input it belongs to (its own `hidden`/`options`/`defaultValue`
* etc.), not the input array as a whole. So every conditionally-visible
* input below carries its own small `dynamic` callback, each independently
* re-deriving the live `FormState` from `args.values` (falling back to
* `saved` per field, via `resolveLiveState`) and reading off just the one
* property it owns.
*/
function buildInputs(saved) {
	const initial = saved;
	const liveState = (values) => resolveLiveState(values, saved);
	return [
		{
			type: "select",
			name: "mode",
			label: "Mode",
			options: MODE_OPTIONS,
			defaultValue: initial.mode
		},
		{
			type: "text",
			name: "field",
			label: "Field",
			defaultValue: initial.field,
			placeholder: DEFAULT_STATE.field,
			description: "JSONPath to the value(s) to convert",
			hidden: initial.mode !== "simple",
			dynamic: (_ctx, args) => ({ hidden: liveState(args.values).mode !== "simple" })
		},
		{
			type: "select",
			name: "from",
			label: "From",
			options: FROM_OPTIONS,
			defaultValue: initial.from,
			hidden: initial.mode !== "simple",
			dynamic: (_ctx, args) => ({ hidden: liveState(args.values).mode !== "simple" })
		},
		{
			type: "select",
			name: "to",
			label: "To",
			options: toOptionsFor(initial.from),
			defaultValue: initial.to,
			hidden: initial.mode !== "simple",
			dynamic: (_ctx, args) => {
				const state = liveState(args.values);
				return {
					hidden: state.mode !== "simple",
					options: toOptionsFor(state.from),
					defaultValue: state.to
				};
			}
		},
		{
			type: "select",
			name: "then",
			label: "Then",
			options: THEN_OPTIONS,
			defaultValue: initial.then,
			hidden: initial.mode !== "simple",
			dynamic: (_ctx, args) => ({ hidden: liveState(args.values).mode !== "simple" })
		},
		{
			type: "text",
			name: "amount",
			label: "Amount",
			defaultValue: initial.amount,
			optional: true,
			hidden: initial.mode !== "simple" || initial.then === "none",
			dynamic: (_ctx, args) => {
				const state = liveState(args.values);
				return { hidden: state.mode !== "simple" || state.then === "none" };
			}
		},
		{
			type: "markdown",
			content: STEP_REFERENCE,
			hidden: initial.mode !== "advanced",
			dynamic: (_ctx, args) => ({ hidden: liveState(args.values).mode !== "advanced" })
		},
		{
			type: "editor",
			name: "rules",
			label: "Rules",
			language: "text",
			defaultValue: initial.rules,
			placeholder: PLACEHOLDER,
			description: "One rule per line: <jsonpath> | <step> | <step>",
			hidden: initial.mode !== "advanced",
			dynamic: (_ctx, args) => ({ hidden: liveState(args.values).mode !== "advanced" })
		}
	];
}
async function convertResponse(ctx, httpRequest, deps) {
	const response = (await ctx.httpResponse.find({
		requestId: httpRequest.id,
		limit: 1
	}))[0];
	if (response == null || response.bodyPath == null) {
		await ctx.toast.show({
			color: "warning",
			message: "No response to convert — send the request first"
		});
		return;
	}
	const bodyPath = response.bodyPath;
	const saved = normalizeSaved(await ctx.store.get(storeKey(httpRequest.id)));
	const values = await ctx.prompt.form({
		id: "filter-convert-rules",
		title: "Convert response",
		confirmText: "Convert",
		inputs: buildInputs(saved)
	});
	if (values == null) return;
	const state = resolveLiveState(values, saved);
	const edited = typeof values[state.mode === "advanced" ? "rules" : "field"] === "string";
	if ((state.mode === "advanced" ? state.rules : state.field).trim() === "") {
		if (edited) {
			await ctx.store.delete(storeKey(httpRequest.id));
			await ctx.toast.show({
				color: "info",
				message: "Cleared the saved conversion for this request"
			});
		} else {
			const message = state.mode === "advanced" ? "No rules entered" : "No field entered";
			await ctx.toast.show({
				color: "warning",
				message
			});
		}
		return;
	}
	const rulesText = state.mode === "advanced" ? state.rules : buildSimpleRuleText(state);
	try {
		await ctx.store.set(storeKey(httpRequest.id), state);
		let body;
		try {
			body = deps.readBody(bodyPath);
		} catch {
			await ctx.toast.show({
				color: "danger",
				message: "Could not read the response body"
			});
			return;
		}
		body = body.replace(BOM, "");
		let root;
		try {
			root = JSON.parse(body);
		} catch {
			await ctx.toast.show({
				color: "danger",
				message: "Response is not valid JSON"
			});
			return;
		}
		let output;
		let converted;
		let matched;
		try {
			const result = applyRules(root, parseRules(rulesText));
			converted = result.converted;
			matched = result.matched;
			output = serialise(result.value);
		} catch (err) {
			if (err instanceof RuleError) {
				await ctx.toast.show({
					color: "danger",
					message: err.message
				});
				return;
			}
			throw err;
		}
		if (matched === 0) await ctx.toast.show({
			color: "warning",
			message: "No values matched — check the selector"
		});
		else if (converted === 0) {
			const unit = matched === 1 ? "value" : "values";
			await ctx.toast.show({
				color: "warning",
				message: `Matched ${matched} ${unit} but none could be converted — check the steps`
			});
		}
		await ctx.prompt.form({
			id: "filter-convert-result",
			title: "Converted response",
			confirmText: "Done",
			inputs: [{
				type: "editor",
				name: "result",
				label: "Result",
				language: "json",
				readOnly: true,
				defaultValue: output
			}]
		});
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		await ctx.toast.show({
			color: "danger",
			message: `Could not convert the response: ${detail}`
		});
	}
}

//#endregion
//#region src/index.ts
const plugin = { httpRequestActions: [{
	label: "Convert response",
	icon: "copy",
	async onSelect(ctx, args) {
		await convertResponse(ctx, args.httpRequest, { readBody: (path) => (0, node_fs.readFileSync)(path, "utf8") });
	}
}] };

//#endregion
exports.plugin = plugin;