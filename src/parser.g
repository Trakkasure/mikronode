start
  = s p:packet+ { return p }
  / null

packet
  = re s tag:tag data:data+ { return {type: "data", data:data, tag:tag} }
  / re s tag:tag { return {type: "re", tag:tag} }
  / re s data:data+ tag:tag { return {type: "data", data:data, tag:tag} }
  / re s data:data+ { return {type: "data", data:data} }
  / re:re s { return {type: "re"} }
  / e:end s {return e}

re
  = "!re" { return ""}

data
  = id:identifier value:value s { return {field:id, value:value}}

identifier
  = "=" id:[\.a-zA-Z\-0-9]+ "=" {return id.join('')}

value
  = v:[^\r\n\0]+ {return v.join('')}
  / v:[\r\n\0] {return ''}

end
  = f:fatal                                      {return {type: "fatal", data:f } }
  / t:trap                                       {return t}
  / "!done" s "=ret=" ret:.+           {return {type: "done_ret", data:ret.join('')}}
  / "!done" s tag:tag s "=ret=" ret:.+ {return {type: "done_ret", tag:tag, data:ret.join('')}}
  / "!done" s tag:tag                            {return {type: "done_ret", tag:tag}}
  / "!done"                                      {return {type: "done" }}
  / tag:tag                                      {return {type: "tag", tag:tag }}

tag 
  = ".tag=" id:[a-zA-Z_\-0-9]+ colon subid:[0-9]+ s {return id.join('')+":"+subid.join('')}
  / ".tag=" id:[a-zA-Z_\-0-9]+ s {return id.join('')}

trap
  = "!trap" s tag:tag s d:data+ { return {type:"trap", tag:tag, data:d} }
  / "!trap" s d:data+ { return {type:"trap", data:d} }

fatal
  = "!fatal" s v:value {return v}

/* Tokens */

s
  = [ \t\r\n\f\0x00]* {return ""}

ns
  = [^ \t\r\n\f\0x00]+

null
  = [\0x00]

colon
  = [:]
