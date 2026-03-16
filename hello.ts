function greet(name: string): string {
  return `Hello, ${name}! Welcome to MeetCat! 🐱`;
}

function main(): void {
  const names = ["World", "Developer", "MeetCat"];
  names.forEach((name) => console.log(greet(name)));
}

main();
