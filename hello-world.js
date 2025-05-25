/**
 * Hello World Demo
 * Simple demonstration file for testing PR review system
 */

function sayHello(name = 'World') {
  return `Hello, ${name}!`;
}

function greetMultiple(names) {
  if (!Array.isArray(names)) {
    throw new Error('Expected an array of names');
  }
  
  return names.map(name => sayHello(name)).join('\n');
}

// Export functions
module.exports = {
  sayHello,
  greetMultiple
};

// Demo usage
if (require.main === module) {
  console.log(sayHello());
  console.log(sayHello('Developer'));
  console.log(greetMultiple(['Alice', 'Bob', 'Charlie']));
}