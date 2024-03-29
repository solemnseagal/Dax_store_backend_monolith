import { BaseDocumentSchema } from "@app/common/infrastructures/base-document.schema";
import { Entity } from "../entity";

export interface IMapper<TEntity, TModel extends BaseDocumentSchema> {
  toModelData(entity: TEntity): TModel;
  toDomain(model: TModel): TEntity;
}
