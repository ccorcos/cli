function Validation(x) {
  return new Success(x)
}

function Success(x) {
  if (!(this instanceof Success)) {
    return new Success(x)
  }
  this.value = x
}

function Failure(x) {
  if (!(this instanceof Failure)) {
    return new Failure(x)
  }
  this.value = x
}

Success.of = function(x) {
  return new Success(x)
}

Failure.of = function(x) {
  return new Failure(x)
}
