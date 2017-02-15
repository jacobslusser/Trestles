(function () {
    'use strict';

    // Our cross-browser compatible version of process.nextTick / setImmediate.
    // https://gist.github.com/bluejava/9b9542d1da2a164d0456
    // https://github.com/knockout/knockout/blob/v3.4.1/src/tasks.js
    // https://github.com/YuzuJS/setImmediate/blob/master/setImmediate.js
    nappy.nextTick = (function () {
        // TODO finish implementing better performing versions
        if (setImmediate) {
            return setImmediate;
        } else {
            return function (callback) {
                setTimeout(callback, 0);
            };
        }
    }());

    // Our Promises/A+ compliant implementation.
    // https://github.com/abdulapopoola/Adehun/blob/master/adehun.js
    // https://github.com/bluejava/zousan/blob/master/src/zousan.js
    // https://www.promisejs.org/implementing/
    // https://github.com/then/promise/blob/master/src/core.js
    var STATE_PENDING = undefined;
    var STATE_FULFILLED = 1;
    var STATE_REJECTED = 2;

    function isFunction(val) {
        return (val && typeof val === 'function');
    }

    function isObject(val) {
        return (val && typeof val === 'object');
    }

    function isPromise(val) {
        return (val && val instanceof Promise);
    }

    function promiseResolutionProc(promise, x) {
        if (promise === x) {
            promise.transition(STATE_REJECTED, new TypeError('A promise cannot be resolved with itself.'));
        } else if (isPromise(x)) {
            if (x.state === STATE_PENDING) {
                x.then(function (y) {
                    promiseResolutionProc(promise, y);
                }, function (e) {
                    promise.transition(STATE_REJECTED, e);
                });
            } else {
                promise.transition(x.state, x.value);
            }
        } else if (isObject(x) || isFunction(x)) {
            var done = false, then;
            try {
                then = x.then;
                if (isFunction(then)) {
                    then.call(x, function (y) {
                        if (done) return;
                        done = true;
                        promiseResolutionProc(promise, y);
                    }, function (r) {
                        if (done) return;
                        done = true;
                        promise.transition(STATE_REJECTED, r);
                    });
                } else {
                    promise.transition(STATE_FULFILLED, x);
                    done = true;
                }
            } catch (e) {
                if (done) return;
                done = true;
                promise.transition(STATE_REJECTED, e);
            }
        } else {
            promise.transition(STATE_FULFILLED, x);
        }
    }

    function Promise(fn) {
        var self = this;

        this.state = STATE_PENDING;
        this.value = null;
        this.queue = [];

        // Captured 'then' args
        this.onFulfilled = null;
        this.onRejected = null;

        function onFulfilledFallback(value) {
            return value;
        }

        function onRejectedFallback(reason) {
            throw reason;
        }

        this.resolve = function (value) {
            promiseResolutionProc(self, value);
        };

        this.reject = function (reason) {
            self.transition(STATE_REJECTED, reason);
        };

        this.then = function (onFulfilled, onRejected) {
            var promise = new Promise();

            // Store callbacks to be processed later
            if (isFunction(onFulfilled)) {
                promise.onFulfilled = onFulfilled;
            }
            if (isFunction(onRejected)) {
                promise.onRejected = onRejected;
            }

            // Queue the callback and process
            self.queue.push(promise);
            processQueue();

            return promise;
        };

        this.transition = function (state, value) {
            if (self.state === state || self.state !== STATE_PENDING) {
                return;
            }

            self.state = state;
            self.value = value;
            processQueue();
        };

        function processQueue() {
            if (self.state === STATE_PENDING) {
                return;
            }

            nappy.nextTick(function () {
                var promise, handler, value;
                while (promise = self.queue.shift()) {
                    if (self.state === STATE_FULFILLED) {
                        handler = promise.onFulfilled || onFulfilledFallback;
                    } else {
                        handler = promise.onRejected || onRejectedFallback;
                    }

                    try {
                        value = handler(self.value);
                    } catch (e) {
                        promise.transition(STATE_REJECTED, e);
                    }

                    promiseResolutionProc(promise, value);
                }
            });
        }

        // Run the user-supplied resolver function to give them the resolve
        // and reject functions they need to complete the promise.
        if (fn) {
            fn(self.resolve, self.reject);
        }
    }

    nappy.promise = function (resolver) {
        return new Promise(resolver);
    };

}());
