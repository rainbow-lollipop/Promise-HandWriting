// 记录Promise的三种状态
const PENDING = 'pending';
const FULFILLED = 'fulfilled';
const REJECTED = 'rejected';

/**
 * 运行一个微队列任务
 * 把传递的回调函数放到微队列中
 * @param {Function} callback 
 */
function runMicroTask(callback) {
  if(process && process.nextTick) { // 判断node环境
    process.nextTick(callback);
  }else if(MutationObserver) { // 浏览器环境

  }else {
    setTimeout(callback, 0);
  }
}

/**
 * 判断一个数据是否是Promise对象（符合PromiseA+规范）
 * @param {any} obj 
 * @returns 
 */
function isPromise(obj) {
  return !!(obj && typeof obj === 'object' && typeof obj.then === 'function');
}

class MyPromise {
  /**
   * 
   * @param {Function} executor 任务执行器，立即执行
   */
  constructor(executor) {
    this._state = PENDING; // 状态
    this._value = undefined; // 数据
    this._handlers = []; // 处理函数形成的队列
    try {
      executor(this._resolve.bind(this), this._reject.bind(this));
    } catch(error) {
      this._reject(error);
    } 
  }

  /**
   * 向处理队列中添加一个函数
   * @param {Function} executor 添加的函数
   * @param {String} state 该函数什么状态下执行
   * @param {Function} resolve 让then函数返回的Promise成功
   * @param {Function} reject 让then函数返回的Promise失败
   */
  _pushHandler(executor, state, resolve, reject) {
    this._handlers.push({
      executor,
      state,
      resolve,
      reject
    })
  }

  /**
   * 根据实际情况执行队列
   */
  _runHandlers() {
    if(this._state === PENDING) {
      // 目前任务仍在挂起
      return;
    }
    while(this._handlers[0]) {
      this._runOneHandler(this._handlers[0]);
      this._handlers.shift();
    }
  }

  /**
   * 处理一个handler任务
   * @param {Object} handler 
   */
  _runOneHandler({executor, state, resolve, reject }) {
    runMicroTask(() => {
      if(this._state !== state) {
        // 状态不一致，不处理
        return;
      }
      if(typeof executor !== 'function') {
        // 传递的后续处理不是一个函数
        this._state === FULFILLED
        ? resolve(this._value)
        : reject(this._value);
        return;
      }
      try {
        const result = executor(this._value);
        if(isPromise(result)) {
          result.then(resolve, reject);
        }else {
          resolve(result);
        }
      }catch(error) {
        reject(error);
      } 
    })
  }

  /**
   * Promise A+规范的then
   * @param {Function} onFulfilled 
   * @param {Function} onRejected 
   */
  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      this._pushHandler(onFulfilled, FULFILLED, resolve, reject);
      this._pushHandler(onRejected, REJECTED, resolve, reject);
      this._runHandlers(); // 执行队列
    })
  }

  /**
   * 仅处理失败的场景
   * @param {Function} onRejected 
   */
  catch(onRejected) {
    return this.then(null, onRejected);
  }

  /**
   * 无论成功还是失败都会执行回调
   * @param {Function} onSettled 
   */
  finally(onSettled) {
    return this.then((data) => {
      onSettled();
      return data;
    }, (reason) => {
      onSettled();
      throw reason;
    });
  }

  /**
   * 更改任务状态
   * @param {String} newState 新状态
   * @param {any} value 相关数据
   */
  _changeState(newState, value) {
    if(this._state !== PENDING) {
      // 目前状态已经更改，无需变化
      return
    }
    this._state = newState;
    this._value = value;
    this._runHandlers(); // 状态变化，执行队列
  }

  /**
   * 标记当前任务完成
   * @param {any} data 任务完成的相关数据
   */
  _resolve(data) {
    // 改变状态和数据
    this._changeState(FULFILLED, data);
  }

  /**
   * 标记当前任务失败
   * @param {any} reason 任务失败的原因
   */
  _reject(reason) {
    // 改变状态和数据
    this._changeState(REJECTED, reason);
  }

  /**
   * 返回一个已完成的Promise
   * @param {any} data 
   * 特殊情况：
   * 1. 传递的data本身就是ES6的Promise对象
   * 2. 传递的data是PromiseLike（符合PromiseA+规范）
   */
  static resolve(data) {
    if(data instanceof MyPromise) {
      return data;
    }
    return new MyPromise((resolve, reject) => {
      if(isPromise(data)) {
        data.then(resolve, reject);
      }else {
        resolve(data);
      }
    })
  }

  /**
   * 返回一个被拒绝的Promise
   * @param {any} reason 
   */
  static reject(reason) {
    return new MyPromise((resolve, reject) => {
      reject(reason);
    })
  }

  /**
   * 得到一个新的Promise
   * 该Promise的状态取决于proms的执行
   * @param {iterator} proms 是一个迭代器，包含多个Promise
   */
  static all(proms) {
    return new MyPromise((resolve, reject) => {
      try {
        const results = [];
        let count = 0; // Promise总数
        let fulfilledCount = 0; // Promise已完成的数量
        for(const promise of proms) {
          let i = count;
          count++;
          MyPromise.resolve(promise).then(data => {
            fulfilledCount++;
            results[i] = data; 
            if(fulfilledCount === count) {
              // 当前是最后一个promise完成了
              resolve(results);
            }
          }, reject)
        }
        if(count === 0) {
          resolve(results);
        }
      } catch(error) {
        reject(error);
      }
    })
  }

  /**
   * 等待所有Promise有结果后，返回Promise完成
   * @param {iterator} proms 
   */
  static allSettled(proms) {
    const ps = [];
    for(const p of proms) {
      ps.push(
        MyPromise.resolve(p).then(
          (value) => ({
            status: FULFILLED,
            value
          }),
          (reason) => ({
            status: FULFILLED,
            reason
          })
        )
      )
    }
    return MyPromise.all(ps);
  }

  /**
   * 返回的Promise与第一个有结果的一致
   * @param {iterator} proms 
   */
  static race(proms) {
    return MyPromise((resolve, reject) => {
      for(const p of proms) {
        MyPromise.resolve(p).then(resolve, reject);
      }
    })
  }
}

// MyPromise.prototype.catch = function() {}
// MyPromise.resolve = function() {}

const promise = new MyPromise((resolve, reject) => {
  resolve(123)
  // throw new Error(123)
})
console.log(promise)