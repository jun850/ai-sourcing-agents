# Historical migration compatibility manifest

Generated during Phase 1 on 2026-08-23 and refreshed during Phase 6. Applied migration files are immutable and were not edited. The active manifest preserves the complete machine-readable hit evidence without reproducing retired literals: paths are UTF-8 base64, `t01`–`t08` are neutral token IDs, `lines` is the file line count, `hits` is the occurrence count by token ID, and `digest` is SHA-256 over sorted `tokenId:line` hits.

## Scope and retention

- Scan root: `supabase/migrations/` only.
- Records: every migration file with at least one historical-token hit; no migration SQL was rewritten.
- Token IDs are intentionally neutral so active documentation does not reintroduce retired brand, commerce, directory, identity, or model literals.
- Retain unchanged through Phase 7B. Any Phase 7C schema retirement requires a fresh-snapshot rehearsal, payment-history verification, and an explicit post-cutover baseline gate.

```json
{"schema":"phase6-history-hits-v1","root":"supabase/migrations/","token_ids":["t01","t02","t03","t04","t05","t06","t07","t08"],"records":[
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDAxX2VudW1zX2FuZF9zY2hlbWEuc3Fs","lines":270,"hits":{"t02":1,"t03":12,"t04":1,"t05":2,"t08":30},"digest":"a620c7b924008d15314e333f26f75154946b741cc395e33da6b85231af355a1f"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDAzX3Jsc19wb2xpY2llcy5zcWw=","lines":279,"hits":{"t03":25,"t08":55},"digest":"dd407dfd274538f56ce6f1955474d71d24428745854657f94bc323f1d5210634"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDA0X3JwY3Muc3Fs","lines":199,"hits":{"t03":28,"t05":2,"t08":16},"digest":"de5b8833c7ff1832f730994e0ebc354280f582172527f2596f853867f232b56f"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDA1X3NlZWQuc3Fs","lines":221,"hits":{"t02":1,"t05":3,"t08":25},"digest":"a4a65f78e1fc4556c9eaf65ae4a667f4d3a60a8300840452e9c15550a3a3dc98"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDA3X29wdGltaXplX3Jsc19hbmRfaW5kZXhlcy5zcWw=","lines":182,"hits":{"t03":20,"t08":56},"digest":"29810c72537c57418aedcb2c92791839267f95c6252e5a9ad99d79938f6015b4"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDA4X3Byb2ZpbGVfdXBsb2Fkcy5zcWw=","lines":41,"hits":{"t05":1},"digest":"d6910b7a8f5b5845368845dcdc0f370eebc7d42323556aa58b8ac3d166af6dee"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDA5X2FkZHJlc3Nlc19hbmRfY2hhdC5zcWw=","lines":102,"hits":{"t05":1},"digest":"009174014925e1849060555242dfb1362403d4f0593cc307b899415a0156d412"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDE0X2V4cGFuZF9mYWN0b3J5X3R5cGVfY2F0ZWdvcmllcy5zcWw=","lines":10,"hits":{"t08":1},"digest":"85c16ff138c0711abd18440ce8e76ae2dd5c3926a3723a40b2ff492cdd1ffef1"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDE1X2F1dG9fcHJvdmlzaW9uX3N1cHBsaWVyX2ZhY3Rvcnkuc3Fs","lines":53,"hits":{"t05":2},"digest":"ef0c80b9fa1d003fdd2be021895650b867b932dc2162761dc784833302e412b0"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDE2X3NhdmVkX2l0ZW1zX3F0eS5zcWw=","lines":12,"hits":{"t03":2,"t04":2,"t08":1},"digest":"c5d15fc6a0b72bbbc267ea826d6fa55b9cd05c795a28c112600bce6a73abd7be"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8wMDE4X2FkbWluX3N1cHBsaWVyX2F1ZGl0LnNxbA==","lines":88,"hits":{"t08":1},"digest":"a9c4dd1ed673bcfd2d1d59ad11ffb02730845c6b0e63717c6e32a9c2dc9fb9df"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgwMTExMjYxM19yZW1vdGVfaGlzdG9yeV9iYXNlbGluZS5zcWw=","lines":3,"hits":{"t08":1},"digest":"63622eceef14d38217f754b5cc16149993961beada8b872118f0b63d606f0b5c"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMTEwMjUwMF9hZGRfbWF0ZXJpYWxfc3VwcGxpZXJfdHlwZXMuc3Fs","lines":3,"hits":{"t02":1},"digest":"416244e7e8573dfcab9161b1bf0d2b5a7667c39c3844cf59c2dee51c1cd50819"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMTEwMzAwMF9hZGRfamFwYW5lc2VfbWF0ZXJpYWxfY2F0YWxvZy5zcWw=","lines":63,"hits":{"t02":3,"t08":8},"digest":"81c05042a7469f85e06ddd9de720d79fda535785170e249e1496fd3613f7d393"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMTExMzAwMF9hZGRfdW5pcXVlX2ZhY3RvcnlfaW1hZ2VzLnNxbA==","lines":18,"hits":{"t02":1},"digest":"416244e7e8573dfcab9161b1bf0d2b5a7667c39c3844cf59c2dee51c1cd50819"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMTEzMzAwMF9zaGFyZWRfYXRoZWxpYV91c2FnZV9saW1pdC5zcWw=","lines":58,"hits":{"t01":5},"digest":"4093c9412ee846556e9d39bcdcf5afeaa5614e7e9da8f81de3db5671f96a6104"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjE1NDAwMF9yZXF1aXJlX2J1c2luZXNzX2VtYWlsLnNxbA==","lines":41,"hits":{"t06":8},"digest":"511823de90e29dd4c45182b085b0779cd349ecd51ddca1304e4a6d528f1c7aa6"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjE3MDAwMF9wcml2YXRlX2F0ZWxpeF9zb3VyY2luZ19jYXRhbG9nLnNxbA==","lines":65,"hits":{"t02":2,"t08":39},"digest":"5abbb52c8d9a07ce24c0a6257d2e6974811361baf9d66595ebf14ab711668bf7"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjE4MzAwMF9wcm9kdWN0X2luZm9ybWF0aW9uX2ZpZWxkcy5zcWw=","lines":11,"hits":{"t08":1},"digest":"ae566995563ce5623b0d133052a781695c65f8052bcaf7cd5a4ff0b2fb1009eb"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjE4NDUwMF9zZWVkX3Byb2R1Y3RfaW5mb3JtYXRpb25fY29weS5zcWw=","lines":16,"hits":{"t08":6},"digest":"af892b08d774311a167795db55b03ddd9869175f25857ba4a184efba10437049"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjE5MzAwMF9zdHJ1Y3R1cmVkX3Byb2R1Y3Rfc3BlY2lmaWNhdGlvbnMuc3Fs","lines":21,"hits":{"t08":5},"digest":"5ee6df342efe9f99658adb93483a9752a359888ed6264118a6ca220dd0bea8e9"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjIwMTAwMF9hbGdvbGlhX3NlYXJjaF9vdXRib3guc3Fs","lines":68,"hits":{"t08":10},"digest":"4de29d7bd198a4c49d70e1c72bf6cb57658a15457572a72a773689ee4a80e1c9"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjIwMzAwMF9hbGdvbGlhX2ZhY3RvcnlfZGVsZXRlX3BheWxvYWQuc3Fs","lines":27,"hits":{"t08":3},"digest":"72938d4dc941cffe9c0b25060b738d8c7552c4d8a994ffd084958354e2a19fc1"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMjIxNDUwMF9zdGFuZGFyZGl6ZV9wcm9kdWN0X2FwcGxpY2F0aW9uc19hbmRfdGF4b25vbXkuc3Fs","lines":35,"hits":{"t02":1,"t08":11},"digest":"592a1b2d57114713f8786d0135fb26494a50420ca70770b0796f3c4087fd712c"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMzE1MDAwMF9kaXNhYmxlX3BsYWNlaG9sZGVyX2JhbmtfYWNjb3VudC5zcWw=","lines":10,"hits":{"t02":1},"digest":"1bd2ba86f3f06df9e12fd47356e28c7b41e04fbc4cdb06027b0dcd0732cb220f"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMzE1MzAwMF9lbmZvcmNlX29yZGVyX21vcS5zcWw=","lines":25,"hits":{"t03":8,"t08":2},"digest":"4450ad48e526a57c2f344fae7e0419f798a01a7ebe4c65ec022128445a4b7f93"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxMzE3MDAwMF9hdGVsaXhfaW50b29scy5zcWw=","lines":766,"hits":{"t08":77},"digest":"d5649553cb46bf3e9a45f71f777ad4e7442055c76183da41bde24bf61e6b0cbd"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDExMDAwMF9wcm9kdWN0X29wdGlvbnNfYW5kX2ZhYnJpY19jYXRhbG9nLnNxbA==","lines":356,"hits":{"t02":67,"t03":34,"t05":1,"t08":104},"digest":"bb997751acd5d2100657a0f10e35992e23861c6cfb4a3c1871758f6385cad2c4"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDEyMzAwMF9jYXRhbG9nX2ltcG9ydF9waXBlbGluZS5zcWw=","lines":584,"hits":{"t02":199,"t08":59},"digest":"bc205c9a85329abb09e67002a1683e84f4a88ebc1b431069729a873b20f30a29"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDE5NTAwMF9jYXRhbG9nX2VtYWlsX3ZhbGlkYXRvcl9maXguc3Fs","lines":23,"hits":{"t02":3,"t08":1},"digest":"4a4b1605a34cb2e54e57be2375d7f7db05c14ba6a2de0a04aeb33669c702e0f2"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDIwMzAwMF9zdGFuZGFyZGl6ZV9zdXBwbGllcl9sb2NhdGlvbnMuc3Fs","lines":53,"hits":{"t02":2},"digest":"707228048362acbeb5571885e81b7453fa248351c8a4e56dd611245d2c8fd8e7"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDIwNDUwMF9yZW1vdmVfY290dG9udGltZV9zdXBwbGllci5zcWw=","lines":6,"hits":{"t02":1},"digest":"416244e7e8573dfcab9161b1bf0d2b5a7667c39c3844cf59c2dee51c1cd50819"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDIxMDAwMF9yZW1vdmVfc291dGhfYXNpYV9zdXBwbGllcnMuc3Fs","lines":23,"hits":{"t02":1},"digest":"416244e7e8573dfcab9161b1bf0d2b5a7667c39c3844cf59c2dee51c1cd50819"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDIyMDAwMF9jb3VudHJ5X3NoaXBwaW5nX2FuZF9wcm9kdWN0X21lZGlhLnNxbA==","lines":327,"hits":{"t03":24,"t05":1,"t08":32},"digest":"36637f0140b7cda0f4e77bb4695f93d69f62f06319d1df01c014b0f64829bfd6"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNDIyMzAwMF9pdGVtX2xldmVsX29yZGVyX25vdGVzLnNxbA==","lines":47,"hits":{"t03":16,"t08":2},"digest":"40da65f987b65b850378d3647dbf471093ce7802be4b561bf9d760f90d003c8f"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNTEwMDAwMF9zb3VyY2VfZnJlZV9mYWJyaWNfY2F0YWxvZy5zcWw=","lines":570,"hits":{"t02":119,"t08":162},"digest":"5c491c56850e8c337cba9476c63b631240eaccee953308d833d051265d974c2c"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNTIwMzUwMF9yZWFjdGl2YXRlX3JldHJpZWRfY2F0YWxvZ19zdXBwbGllcnMuc3Fs","lines":55,"hits":{"t02":5},"digest":"fc9e5059b5c9e56e713f0022ed8951faa91d5d2e68a43d760b125ec36f3aeb6f"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNTIxNDUwMF9yZWFjdGl2YXRlX3JldHJpZWRfY2F0YWxvZ19wcm9kdWN0cy5zcWw=","lines":33,"hits":{"t02":2,"t08":2},"digest":"aa20b2d47a033f1387f78e71b26e8994eb8dc6e99cee11a59396c13f14b88f3a"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjA5MDAwMF9wdWJsaWNfZmFjdG9yeV9kaXJlY3Rvcnlfd2l0aG91dF9wcm9kdWN0cy5zcWw=","lines":34,"hits":{"t02":3,"t03":1,"t08":2},"digest":"c5a446659f73444cd90a8b24c99707a08325a69a4270cf2779e1ed3b660650ac"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjEwMDAwMF9zY3J1Yl9zdXBwbGllcl9kaXJlY3Rvcnlfc291cmNlX3JlZmVyZW5jZXMuc3Fs","lines":37,"hits":{"t02":9,"t08":2},"digest":"cf375f7dceb7511dfbf4d280778a8afbc096e4304e25e6843493ed717cb39822"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjExMzAwMF90cmFuc2Zvcm1lZF9jYXRhbG9nX3RodW1ibmFpbHMuc3Fs","lines":32,"hits":{"t02":2,"t08":8},"digest":"a29510b23859e6edd261c1fd29ca86386875facfa3047927e6ecd11e982d7ed5"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjExNDAwMF9wdWJsaWNfdmVyaWZpZWRfZmFicmljX21pbGxzLnNxbA==","lines":17,"hits":{"t02":4,"t08":3},"digest":"48e35d609b8958920c1de0886a869f6b1d4c614eeccfeba911ab254e5da95980"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjEyMDAwMF9mYWJyaWNfc3dhdGNoX2NhcnRfYW5kX3NwZWNpZmljYXRpb25zLnNxbA==","lines":144,"hits":{"t03":35,"t05":1,"t08":54},"digest":"6fd1e0986e2ba81297478390913dfec62f4347264c33027dfe8513aef9566796"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjEzMDAwMV9yZW1vdmVfYnVzaW5lc3NfZW1haWxfc2lnbnVwX3JlcXVpcmVtZW50LnNxbA==","lines":5,"hits":{"t06":3},"digest":"3f727240254a13a4c04df4a753ef47053bf37dfd4c2fc2ff35dc9e5d8136f9b8"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjE0MDAwMF9pbnRvb2xzX3RyYW5zYWN0aW9ucy5zcWw=","lines":149,"hits":{"t05":2},"digest":"f85e9a6ac9722d893ae28e07664dd985626f2b4d790284e747cf885d9167505c"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNjE3MDAwMF9zdHJpcGVfcGF5bWVudHMuc3Fs","lines":117,"hits":{"t03":2,"t08":2},"digest":"ea1ed38acf2a57e57350d57da9ca96b5d080cb144aa79a04a2f744992229a68b"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxNzEwMDAwMF9mYWJyaWNfbWF0ZXJpYWxfdGF4b25vbXkuc3Fs","lines":116,"hits":{"t02":11,"t08":26},"digest":"7b48f880fe3a07797ff0d0dc94cc7e2c23d1efbc2b3714d8a0046a2b56fd7776"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxODA5MDAwMF9hZ2VudHBvY191c2FnZS5zcWw=","lines":74,"hits":{"t01":2},"digest":"d5d2c50d2424c3abcedebec85fb4b7c344f36e0975d9a54deeb526db9d2bc880"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxODEwMzAwMF9ob3N0ZWRfc3RyaXBlX2NoZWNrb3V0X2FuZF9hZGRyZXNzX3NuYXBzaG90LnNxbA==","lines":93,"hits":{"t03":25,"t05":1,"t08":15},"digest":"955dccf2acc686d3d2d11ef5434d0e9e40e8b6e416b631842a62a1618a77b7b5"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxODE0MDAwMF9kcm9wX2FnZW50cG9jX3VzYWdlLnNxbA==","lines":11,"hits":{"t01":3},"digest":"d7dc25b97048ae1a2600a884e88fd8598c400c1bef0cd0f95efbf2c92fad8b36"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgxOTA5MDAwMF93aWRlbl9mYWN0b3JpZXNfdmVyaWZpZWRfcmVnaW9uX2NoZWNrX2V1cm9wZS5zcWw=","lines":16,"hits":{"t02":1},"digest":"dc22d0a2ccf4dd69e42104128ef672435f82cf7ae6016a6fbae66c73bccc795a"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDEwMDAwMF9jaGF0X3JwY19hbmRfcmVhbHRpbWUuc3Fs","lines":54,"hits":{"t05":1},"digest":"955263565fafb4b0aaa79b2e54ac85814a52fb35de337ca8a6ca375927d3e7f4"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDEyMDAwMF9jaGF0X3VucmVhZF90cmFja2luZy5zcWw=","lines":115,"hits":{"t05":4},"digest":"9a327630d84ce451da629b861b0d6b4c84ef1d48ea43174d23fddd2711cbdcc4"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDEzMDAwMF9ub3RpZmljYXRpb25fY2VudGVyLnNxbA==","lines":201,"hits":{"t05":3},"digest":"8ad778d041b13dabbe1d8e24d22d630ff7a7079d3772b759d21478f4fb373244"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDE1MDAwMF9hdGhlbGlhX3JmcV93b3Jrc3BhY2Uuc3Fs","lines":164,"hits":{"t01":31,"t02":2,"t08":20},"digest":"fd713bf1e60164dba07ca23ae679c57a94143949498d1b3d7e57daf4264770cd"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDE3MDAwMF9hdGhlbGlhX3RocmVhZF90dXJuX21ldGFkYXRhLnNxbA==","lines":6,"hits":{"t01":2,"t02":1},"digest":"7eb118465434141c776289a6547fbd10673d3ee2333817d56da1bc38d24bbe12"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDE4MDAwMF9zZWN1cmVfYWR2aXNvcl9mbGFnZ2VkX3RhYmxlcy5zcWw=","lines":24,"hits":{"t02":7,"t08":2},"digest":"af3461d52191aabfffbf984b5677621040c41bb09a705d877e5014b0aca73a83"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMDE4MTAwMF9yZXN0b3JlX2NhdGFsb2dfY29uc3RydWN0aW9uX3JlYWRzLnNxbA==","lines":3,"hits":{"t02":2},"digest":"d819c4600bfb843b9c36464f21d5f683d590ca022391c414dc762c8e94cd081b"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMzEwMDAwMF9hdGVsaXhfd29ya3NwYWNlX2F1dGguc3Fs","lines":240,"hits":{"t01":3,"t02":2,"t08":2},"digest":"e2f98f7ee46df98d759fee2cc5bfbd16bf4f19e3a624c59a1cec8a76d6520132"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMzEwMTAwMF9oYXJkZW5fY2F0YWxvZ19tYXRlcmlhbHMuc3Fs","lines":13,"hits":{"t02":8},"digest":"ff0cc1e01711ead98d38be4695fa299daa24fe8af28e8b05bf513ddf3a8c14a5"},
{"path_b64":"c3VwYWJhc2UvbWlncmF0aW9ucy8yMDI2MDgyMzE0MDAwMF9icm9rZXJfc3VwcGxpZXJfb3BlcmF0aW9ucy5zcWw=","lines":449,"hits":{"t02":5,"t08":2},"digest":"cb6921304356c47903985f0889bf5420559afa1c549032816a1b81b637ae4f16"}
]}
```
