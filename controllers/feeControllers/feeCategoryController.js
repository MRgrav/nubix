// controllers\feeControllers\feeCategoryController.js
import prisma from "../../models/prisma.js";
import { sendSuccess, sendError } from "../../utils/responseStructure.js";

export const createFeeCategory = async (req, res) => {
  const { name, type, description, isDefault = false } = req.body;

  if (!name || !type) {
    return sendError(
      res,
      400,
      "name and type are required",
      "VALIDATION_ERROR",
    );
  }

  try {
    const category = await prisma.feeCategory.create({
      data: { name: name.trim(), type, description, isDefault },
    });
    return sendSuccess(res, 201, category, "Fee category created successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Category name already exists",
        "DUPLICATE_CATEGORY",
      );
    }
    return sendError(
      res,
      500,
      "Failed to create fee category",
      "INTERNAL_ERROR",
    );
  }
};

export const getFeeCategories = async (req, res) => {
  const { type } = req.query;
  try {
    const where = type ? { type } : {};
    const categories = await prisma.feeCategory.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return sendSuccess(
      res,
      200,
      categories,
      "Fee categories fetched successfully",
    );
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch fee categories",
      "INTERNAL_ERROR",
    );
  }
};

export const updateFeeCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const category = await prisma.feeCategory.findUnique({
      where: { id: parseInt(id) },
    });
    if (!category) {
      return sendError(res, 404, "Category not found", "NOT_FOUND");
    }

    // TODO: Uncomment to prevent updates to default categories
    // if (category.isDefault) {
    //   return sendError(
    //     res,
    //     403,
    //     "Cannot update default category",
    //     "FORBIDDEN_OPERATION"
    //   );
    // }

    const updated = await prisma.feeCategory.update({
      where: { id: parseInt(id) },
      data: { name: name?.trim(), description },
    });

    return sendSuccess(res, 200, updated, "Fee category updated successfully");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to update fee category",
      "INTERNAL_ERROR",
    );
  }
};

export const deleteFeeCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await prisma.feeCategory.findUnique({
      where: { id: Number(id) },
    });

    if (!category) {
      return sendError(res, 404, "Category not found", "NOT_FOUND");
    }

    if (category.isDefault) {
      return sendError(
        res,
        403,
        "Cannot delete default category",
        "FORBIDDEN_OPERATION",
      );
    }

    await prisma.feeCategory.delete({
      where: { id: Number(id) },
    });

    return sendSuccess(res, 200, null, "Fee category deleted successfully");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to delete fee category",
      "INTERNAL_ERROR",
    );
  }
};

export const createBulkFeeCategories = async (req, res) => {
  const { categories } = req.body; // Expect array of { name, type, description, isDefault }
  if (!Array.isArray(categories) || categories.length === 0) {
    return sendError(
      res,
      400,
      "categories must be a non-empty array",
      "VALIDATION_ERROR",
    );
  }
  try {
    const createdCategories = await prisma.$transaction(
      categories.map((cat) =>
        prisma.feeCategory.create({
          data: {
            name: cat.name.trim(),
            type: cat.type,
            description: cat.description,
            isDefault: cat.isDefault ?? false,
          },
        }),
      ),
    );
    return sendSuccess(
      res,
      201,
      createdCategories,
      "Fee categories created successfully in bulk",
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "One or more category names already exist",
        "DUPLICATE_CATEGORY",
      );
    }
    return sendError(
      res,
      500,
      "Failed to create bulk fee categories",
      "INTERNAL_ERROR",
    );
  }
};
