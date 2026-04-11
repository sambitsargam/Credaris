#!/usr/bin/expect -f
set timeout 600

spawn leo deploy

expect {
  "proceed with deployment?" {
    send "yes\r"
    exp_continue
  }
  "Would you like to proceed?" {
    send "yes\r"
    exp_continue
  }
  eof
}
