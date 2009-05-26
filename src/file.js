node.fs.exists = function (path, callback) {
  node.fs.stat(path, function (status) {
    callback(status == 0);
  });
}

node.fs.cat = function (path, encoding, callback) {
  var file = new node.fs.File({encoding: encoding});

  file.onError = function (method, errno, msg) {
    callback(-1);
  };

  var content = (encoding == node.fs.UTF8 ? "" : []);
  var pos = 0;
  var chunkSize = 10*1024;

  function readChunk () {
    file.read(chunkSize, pos, function (chunk) {
      if (chunk) {
        if (chunk.constructor == String)
          content += chunk;
        else
          content = content.concat(chunk);

        pos += chunk.length;
        readChunk();
      } else {
        callback(0, content);
        file.close();
      }
    });
  }

  file.open(path, "r", function () {
    readChunk();
  });
}

node.fs.File = function (options) {
  var self = this;
  options = options || {};

  if (options.encoding === undefined)
    self.encoding = node.fs.RAW;
  else
    self.encoding = options.encoding

  //node.debug("encoding: opts=" + options.encoding + " self=" + self.encoding);
  self.fd = options.fd || null;

  var actionQueue = [];
  
  // Adds a method to the queue. 
  function addAction (method, args, callback) {
    var action = { method: method 
                 , callback: callback
                 , args: args
                 };
    //node.debug("add action: " + JSON.stringify(action));
    actionQueue.push(action);

    // If the queue was empty, immediately call the method.
    if (actionQueue.length == 1) act();
  }

  // called after each action finishes (when it returns from the thread pool)
  function poll () {
    var action = actionQueue[0];

    var errno = arguments[0]; 

    if (errno < 0) {
      if (self.onError)
        self.onError(action.method, errno, node.fs.strerror(errno));
      actionQueue = []; // empty the queue.
      return;
    }

    var rest = [];
    for (var i = 1; i < arguments.length; i++)
      rest.push(arguments[i]);

    //node.debug("poll action: " + JSON.stringify(action));
    //node.debug("poll rest: " + JSON.stringify(rest));

    if (action.callback)
      action.callback.apply(this, rest);

    actionQueue.shift();
    act();
  }

  function act () {
    var action = actionQueue[0]; // peek at the head of the queue
    if (action) {
      internal_methods[action.method].apply(this, action.args);
    }
  }

  var internal_methods = {
    open: function (path, mode) {
      var m = node.fs.O_RDONLY;
      switch (mode) {
        case "r":
          m = node.fs.O_RDONLY;
          break;
        case "r+":
          m = node.fs.O_RDWR;
          break;
        case "w":
          m = O_CREAT | O_TRUNC | O_WRONLY;
          break;
        case "w+":
          m = O_CREAT | O_TRUNC | O_RDWR;
          break;
        case "a":
          m = O_APPEND | O_CREAT | O_WRONLY; 
          break;
        case "a+":
          m = O_APPEND | O_CREAT | O_RDWR; 
          break;
        default:
          throw "Unknown mode";
      }

      node.fs.open(path, m, 0666, function (status, fd) {
        self.fd = fd;
        poll(status, fd);
      });
    },

    close: function ( ) {
      node.fs.close(self.fd, function (status) {
        self.fd = null;
        poll(status);
      });
    }, 

    read: function (length, position) {
      //node.debug("encoding: " + self.encoding);
      node.fs.read(self.fd, length, position, self.encoding, poll);
    },

    write: function (data, position) {
      node.fs.write(self.fd, data, position, poll);
    }
  };

  self.open = function (path, mode, callback) {
    addAction("open", [path, mode], callback);
  };
   
  self.close = function (callback) {
    addAction("close", [], callback);
  };

  self.read = function (length, pos, callback) {
    addAction("read", [length, pos], callback);
  };

  self.write = function (buf, pos, callback) {
    addAction("write", [buf, pos], callback);
  };

  self.print = function (data, callback) {
    return self.write(data, null, callback);
  };

  self.puts = function (data, callback) {
    return self.write(data + "\n", null, callback);
  };
};

stdout = new node.fs.File({ fd: node.fs.STDOUT_FILENO });
stderr = new node.fs.File({ fd: node.fs.STDERR_FILENO });
stdin = new node.fs.File({ fd: node.fs.STDIN_FILENO });

puts = function (data, callback) {
  stdout.puts(data, callback);
}

p = function (data, callback) {
  puts(JSON.stringify(data), callback);
}
