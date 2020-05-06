/**
 *	Author: JCloudYu
 *	Create: 2020/01/19
**/
(()=>{
	"use strict";
	
	const _HTML_TAG = /^<([^<>]+)>$/;
	const _EVENT_FORMAT = /^([a-zA-Z0-9\-_]+)(,[a-zA-Z0-9\-_]+)*(::([a-zA-Z0-9\-_]+))?$/;
	const _PRIVATES		= new WeakMap();
	const _EVENT_MAP	= new WeakMap();
	const _CONTROLLERS	= new Map();
	
	const ElmAccessorProxyHandler = {
		getPrototypeOf: function(obj) {
			return Object.getPrototypeOf(obj);
		},
		get: function(obj, prop) {
			const {element, exported, func_bind, func_relink, func_bind_event, func_unbind_event, func_emit_event} = _PRIVATES.get(obj);
			if ( prop === 'element' ) return element;
			if ( prop === 'is_accessor' ) return true;
			if ( prop === 'bind' ) return func_bind;
			if ( prop === 'relink' ) return func_relink;
			if ( prop === 'on' || prop === 'addEventListener' ) return func_bind_event;
			if ( prop === 'off' || prop === 'removeEventListener' ) return func_unbind_event;
			if ( prop === 'emit' || prop === 'dispatchEvent' ) return func_emit_event;
			
			return exported[prop] || obj[prop];
		},
		set: function(obj, prop, value) {
			if ( prop === "element" ) return false;
			if ( prop === "bind" ) return false;
			if ( prop === "relink" ) return false;
			
			const {exported} = _PRIVATES.get(obj);
			if ( !exported[prop] ) {
				obj[prop] = value;
			}
			return true;
		}
	};
	const ELM_JS_ENDPOINT = (...args)=>{
		return new Proxy(new ElmAccessor(...args), ElmAccessorProxyHandler);
	};
	ELM_JS_ENDPOINT.DOM = (selector)=>{
		const matches = selector.match(_HTML_TAG);
		if ( matches === null ) {
			return document.querySelectorAll(selector);
		}
		
		return document.createElement(matches[1]);
	};
	ELM_JS_ENDPOINT.controller = (name, controller)=>{
		if ( typeof controller !== "function" ) {
			throw new TypeError( "Argument 2 must be a constructor!" );
		}
		
		name = (''+(name||'')).trim();
		_CONTROLLERS.set(name, controller);
	};
	window.WhelmJS = Object.freeze(ELM_JS_ENDPOINT);
	
	
	
	
	
	class ElmAccessor {
		constructor(element=null) {
			const _PRIVATE = Object.assign(Object.create(null), {
				element:null, exported:Object.create(null),
				func_bind: ElmAccessor.prototype.bind.bind(this),
				func_relink: ElmAccessor.prototype.relink.bind(this),
				func_bind_event: ___ADD_EVENT_LISTENER.bind(this),
				func_unbind_event: ___REMOVE_EVENT_LISTENER.bind(this),
				func_emit_event: ___DISPATCH_EVENT.bind(this)
			});
			_PRIVATES.set(this, _PRIVATE);
			
			
			if ( arguments.length === 0 ) return;
			
			this.bind(element);
		}
		bind(element) {
			if ( !(element instanceof Element) ) {
				throw new TypeError( "ElmAccessor constructor only accept Element instances!" );
			}
			
			const _PRIVATE = _PRIVATES.get(this);
			_PRIVATE.element = element;
			_PRIVATE.exported = Object.create(null);
			
			this.relink();
		}
		relink() {
			const _PRIVATE = _PRIVATES.get(this);
			_PRIVATE.exported = Object.create(null);
			
			const {element, exported} = _PRIVATE;
			__RESOLVE_ACCESSOR(exported, element, element);
		}
	}
	class ElmTemplate {
		constructor(element) {
			if ( typeof element === "string" ) {
				var tmp = document.implementation.createHTMLDocument();
				tmp.body.innerHTML = element;
				if ( tmp.body.children.length !== 1 ) {
					throw new TypeError( "HTMLTemplate constructor only html string that is resolved as single Element instance!" );
				}
				
				element = tmp.body.children[0];
			}
			else
			if ( element instanceof Element ) {
				element.remove();
				element = element.cloneNode(true);
			}
			else {
				throw new TypeError( "HTMLTemplate constructor only accepts an Element instance!" );
			}
			
			
			
			Object.defineProperties(this, {
				_tmpl_elm: {
					configurable:false, writable:false, enumerable:false,
					value:element
				}
			});
			
			element.removeAttribute('elm-export-tmpl');
			element.removeAttribute('elm-export');
		}
		get is_template() { return true; }
		duplicate() {
			return ELM_JS_ENDPOINT(this._tmpl_elm.cloneNode(true));
		}
	}
	function __RESOLVE_ACCESSOR(exports, root_element, element) {
		const candidates = [];
		for (const item of element.children) {
			if ( !item.hasAttribute('elm-export') ) {
				candidates.push(item);
				continue;
			}
			
			const export_name = item.getAttribute('elm-export');
			if ( item.hasAttribute('elm-export-tmpl') ) {
				exports[export_name] = new ElmTemplate(item);
				continue;
			}
			
			if ( item.hasAttribute('elm-export-accessor') ) {
				exports[export_name] = ELM_JS_ENDPOINT(item);
				continue;
			}
			
			if ( item.hasAttribute('elm-export-inst') ) {
				const inst = item.getAttribute('elm-export-inst').trim();
				if ( !inst || inst === "accessor" ) {
					exports[export_name] = ELM_JS_ENDPOINT(item);
					continue;
				}
				
				const controller = _CONTROLLERS.get(inst);
				if ( !controller ) {
					throw new TypeError(`Destination controller '${inst}' is not registered yet!`);
				}
				
				exports[export_name] = new controller(item);
				continue;
			}
			
			
			
			// Normal element with event
			if ( item.hasAttribute('elm-bind-event') ) {
				let ITEM_EVENT_MAP = _EVENT_MAP.get(item);
				if ( !ITEM_EVENT_MAP ) {
					ITEM_EVENT_MAP = new Map();
					_EVENT_MAP.set(item, ITEM_EVENT_MAP);
				}
				
				
				const event_descriptor = item.getAttribute('elm-bind-event').trim();
				const matches = _EVENT_FORMAT.test(event_descriptor);
				if ( !matches ) {
					throw new SyntaxError(`Incorrect event '${event_descriptor}' in 'elm-bind-event' tag`);
				}
				
				
				
				const event_pairs = event_descriptor.split(',');
				for(const event_pair of event_pairs) {
					let [source_event, dest_event] = event_descriptor.split('::');
					if ( dest_event === '' ) {
						dest_event = source_event;
					}
					
					const prev_handler = ITEM_EVENT_MAP.get(event_pair);
					if ( prev_handler ) {
						item.removeEventListener(source_event, prev_handler);
						ITEM_EVENT_MAP.delete(event_pair);
					}
					
					
					
					
					const event_dispatcher = (e)=>{
						const event = new Event(dest_event, {bubbles:true});
						Object.defineProperties(event, {
							original_event: {value:e, configurable:false, enumerable:true, writable:false}
						});
						root_element.dispatchEvent(event);
					};
					
					item.addEventListener(source_event, event_dispatcher);
					ITEM_EVENT_MAP.set(event_pair, event_dispatcher)
				}
			}
			
			if ( item.hasAttribute('elm-bind-event-bubble') ) {
				let ITEM_EVENT_MAP = _EVENT_MAP.get(item);
				if ( !ITEM_EVENT_MAP ) {
					ITEM_EVENT_MAP = new Map();
					_EVENT_MAP.set(item, ITEM_EVENT_MAP);
				}
				
				
			
				const event_descriptor = item.getAttribute('elm-bind-event-bubble').trim();
				const matches = _EVENT_FORMAT.test(event_descriptor);
				if ( !matches ) {
					throw new SyntaxError(`Incorrect event '${event_descriptor}' in 'elm-bind-event-bubble' tag`);
				}
				
				const event_pairs = event_descriptor.split(',');
				for(const event_pair of event_pairs) {
					let [source_event, dest_event] = event_descriptor.split('::');
					if ( dest_event === '' ) {
						dest_event = source_event;
					}
					
					const prev_handler = ITEM_EVENT_MAP.get(event_pair);
					if ( prev_handler ) {
						item.removeEventListener(source_event, prev_handler);
						ITEM_EVENT_MAP.delete(event_pair);
					}
					
					
					
					
					const event_dispatcher = (e)=>{
						const event = new Event(dest_event, {bubbles:true});
						Object.defineProperties(event, {
							original_event: {value:e, configurable:false, enumerable:true, writable:false}
						});
						root_element.dispatchEvent(event);
					};
					
					item.addEventListener(source_event, event_dispatcher);
					ITEM_EVENT_MAP.set(event_pair, event_dispatcher)
				}
			}
			
			if ( item.hasAttribute('elm-detached') ) {
				item.remove();
			}
			candidates.push(item);
			exports[export_name] = item;
		}
		
		for(const elm of candidates) {
			__RESOLVE_ACCESSOR(exports, root_element, elm);
		}
	}
	function ___ADD_EVENT_LISTENER(events, listener, ...args) {
		const {element} = _PRIVATES.get(this);
		if ( !element ) return;
		
		const event_names = events.split(',');
		for(const event of event_names) {
			element.addEventListener(event, listener, ...args);
		}
		return this;
	}
	function ___REMOVE_EVENT_LISTENER(events, listener, ...args) {
		const {element} = _PRIVATES.get(this);
		if ( !element ) return;
		
		const event_names = events.split(',');
		for(const event of event_names) {
			element.removeEventListener(event, listener, ...args);
		}
		return this;
	}
	function ___DISPATCH_EVENT(...args) {
		const {element} = _PRIVATES.get(this);
		if ( !element ) return;
		
		element.dispatchEvent(...args);
		return this;
	}
})();
