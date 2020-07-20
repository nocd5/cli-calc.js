# cli-calc.js

Calculator for CLI with math.js

![](screenshot.png)

## Commands


| Command          | Function         |
|:-----------------|:-----------------|
| `exit` or `quit` | exit cli-calc.js |
| `ls`             | list values      |
| `history`        | show history     |
| `cls`            | clear display    |
| `clear`          | clear history    |

## Features

- Using math.js functions

```sh
Calc > round(sqrt(3))
2
Calc > ceil(sqrt(2))
2
```

- Reusing a previous result with `@`

```sh
Calc > 2+3
5
Calc > @*20
100
```

- Getting Hexadecimal/Binary string

```sh
Calc > hex(1194684)
0x123ABC
Calc > bin(12)
0b1100
```

- Using Hexadecimal/Binary with suffix `0x`/`0b`

```sh
Calc > 0xCAFE
51966
Calc > 0b1010
10
```

- Using SI prefixes

```sh
Calc > 1k
1000
Calc 1m
1000000
Calc > 1mm
0.001
Calc > 2m*1uu
2
```

ignore case

- Using temporary value

```sh
Calc > a=10
10
Calc > b=20
20
Calc > c=30
30
Calc > a+b*c
610
```

- User defined function

```sh
Calc > f(a,b)=a*2+b
f(a, b) = a * 2 + b
Calc > f(2,3)
7
```

- Copy & Paste

|                   |       |
|:-----------------:|:------|
| <kbd>Ctrl-C</kbd> | Copy  |
| <kbd>Ctrl-V</kbd> | Paste |
