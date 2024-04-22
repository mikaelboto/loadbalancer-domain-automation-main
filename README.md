A automação é composta por 4 funções lambdas.

2 delas serão rotinas automáticas e 2 precisam ser integradas à aplicação de vocês e podem ser chamadas utilizando o SDK do Lambda.
Documentação e Exemplos SDK PHP: https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/php_lambda_code_examples.html


Descrição das Funções Lambda:

### register-domain

Nome para invocação:
domain-automation-prod-register-domain

Descrição:
Realiza o registro de um certificado no ACM e retorna os records necessários para a validação do certificado assim como o CNAME que deve ser criado apontando para o DNS do Loadbalancer ativo.

Payload:
```
{
    "domain": "abc.com.br"
}
```

Response:
```
{

    "certificateId": "123-456-789",
    "records": [

         {

            "Name": "abc.com.br",

             "Type": "CNAME",

             "Value": "12345.x.com.br"

         },

         {

            "Name": "123.validation.aws.com",

             "Type": "CNAME",

             "Value": "456.validation.aws.com"

         }

     ]
}
```

### get-certificate-status

Nome para invocação:
domain-automation-prod-get-certificate-status

Descrição:
Retorna o Status de cada Registro do certificado do ACM.

Payload:
```
{
    "certificateId": "123-456-789"
}
```


Response:
```

{
    "message": "Certificado ainda não foi validado",
    "domainValidationOptions": [
        {
            "DomainName": "x.z.com.br",
            "ResourceRecord": {
                "Name": "_1ee3a20da88fb83bf6253d121a246ce0.x.z.com.br.",
                "Type": "CNAME",
                "Value": "_2477df64b43656bc47ed24f666227a4c.mhbtsbpdnt.acm-validations.aws."
            },
            "ValidationDomain": "x.z.com.br",
            "ValidationMethod": "DNS",
            "ValidationStatus": "SUCCESS"
        },

        {
            "DomainName": "x.z.com.br",
            "ResourceRecord": {
                "Name": "_1ee3a20da88fb83bf6253d121a246ce0.x.z.com.br.",
                "Type": "CNAME",
                "Value": "_3477df64b43656bc47ed24f666227a4c.mhbtsbpdnt.acm-validations.aws."
            },
            "ValidationDomain": "x.z.com.br",
            "ValidationMethod": "DNS",
            "ValidationStatus": "PENDING"
        }
    ]
}
```


### attach-certificate
Rotina Automática

Assim que for identificado que o certificado foi validado, é realizada a associação do certificado ao Loadbalancer ativo.


### check-alb

Rotina Automática

Assim que for identificado que o número de certificados no Loadbalancer ativo atingiu o número máximo, é realizada a criação e configuração de um novo Loadbalancer. Esse novo Loadbalancer será definido como "ativo".
