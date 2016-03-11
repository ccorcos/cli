function Success(x) {
  this.value = x
}

function Failure(x) {
  this.value = x
}

Success.of = function(x) {
  return new Success(x)
}

Failure.of = function(x) {
  return new Failure(x)
}

Success.prototype.isSuccess = true
Failure.prototype.isFailure = true

Success.prototype.map = function(f) {
  return Success.of(f(this.value))
}

Failure.prototype.map = function(_) {
  return this
}

Success.prototype.ap = function(other) {
  return other.isSuccess ?
         other.map(this.value) :
         other
}

Failure.prototype.ap = function(other) {
  return other.isFailure ?
         Failure.of(this.value.concat(other.value)) :
         this
}

Success.prototype.chain = function(f) {
  return this.map(f).value
}

Failure.prototype.chain = function(_) {
  return this
}

// provide nested error context
Success.prototype.context = function(_) {
  return this
}

Failure.prototype.context = function(str) {
  return Failure.of([str, this.value])
}

// Success.prototype.cata = function(spec) {
//   return this.map(spec.Success)
// }

// Failure.prototype.cata = function(spec) {
//   return this.map(spec.Failure)
// }

Failure.prototype.toString = function() {
  return 'Failure(' + this.value + ')'
}

Success.prototype.toString = function() {
  return 'Success(' + this.value + ')'
}

function Validation() {}
Validation.Success = Success
Validation.Failure = Failure
Validation.coerse = function(x) {
  return !x ? Success.of(x) :
         x.isSuccess ? x :
         x.isFailure ? x :
         Success.of(x)
}

export default Validation