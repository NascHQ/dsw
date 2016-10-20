# Contributing

So, you want to contribute? Cool! We need it! :)  
We ask you to please read and follow our [Code of Conduct](https://github.com/NascHQ/dsw/blob/master/CODE_OF_CONDUCT.md).

### Creating issues

Try and follow the [issue_template](https://github.com/NascHQ/dsw/blob/master/ISSUE_TEMPLATE.md) when creating issues.
We can use the labels to best address them, afterwards.

### Coding (Pull Requests)

Here is how...and yep, as Service workers are still a little too new, it is a little bit weird! Here is how I've been doing this, and if you have any better suggestion, please let me know :)

1 - Clone the project

```git clone https://github.com/NascHQ/dsw```

2 - Enter the project directory and install it

```
cd dsw
npm install
```

3 - Start watching it

```npm run watch```

4 - Use the sandbox to test it (run this command in another terminal window or tab, so the watch command can continue running)

```npm run try```

5 - Access in the browser, the address in the right port, as provided by the previous command, something like:

`http://localhost:8888/`

Please notice we use `eslint` to validate the code styles. You can see the rules in the `.eslintrc.js` file.

### Testing your changes

Whenever you change any files inside the `src` directory, the _watch_ will re-build it for you (wait until you see the **"DONE"** output).

This is automatic, but you stillneed to reload the _try_ command in the other tab:

```
^C # ctrl+C to stop the previous try, and then...
npm run try
```
