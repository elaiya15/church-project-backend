const Offerings = require('../Schema/offerSchema');
const Member = require("../Schema/memberSchema");

// Controller functions
const addOffering = async (req, res) => {
  try {
    const { category, member_id, member_name, date, amount, description } = req.body;
    // console.log(req.body);

    let memberData = null; // Declare memberData at the top

    // Fetch member data separately if category is not "NO_Name_Offerings"
    if (category !== "NO_Name_Offerings") {
      // console.log("memberData enter");

      memberData = await Member.findOne({ member_id }).select('member_photo').lean();
      // console.log(memberData);

      if (!memberData) {
        return res.status(404).json({ message: 'Member not found' });
      }
    }

    const newOffering = new Offerings({ category, member_id, member_name, date, amount, description });
    await newOffering.save();

    // Construct the response object
    let offeringWithPhoto;
    if (category !== "NO_Name_Offerings") {
      offeringWithPhoto = {
        ...newOffering.toObject(), // Convert Mongoose document to plain object
        member_photo: memberData.member_photo, // Only include member_photo if memberData exists
      };
    } else {
      offeringWithPhoto = {
        ...newOffering.toObject(), // Convert Mongoose document to plain object
      };
    }

    // Respond with the modified object
    return res.status(201).json({ message: 'Offering added successfully', offering: offeringWithPhoto });
  } catch (error) {
    // console.log({ error: error.message, error });
    res.status(400).json({ error: error.message });
  }
};


const getDistinctCategories = async (req, res) => {
  try {
    const categories = await Offerings.distinct('category');
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



const getMonthlyTotals = async (req, res) => {
  const { year } = req.query;
// console.log(req.query.year);
  if (!year) {
    return res.status(400).json({ message: 'Year is required' });
  }

  try {
    const pipeline = [
      {
        $match: {
          date: {
            $gte: new Date(year, 0, 1),
            $lt: new Date(Number(year) + 1, 0, 1),
          },
        },
      },
      {
        $group: {
          _id: { $month: '$date' },
          totalAmount: { $sum: '$amount' },
        },
      },
    ];
    
    const expenses = await Offerings.aggregate(pipeline);

    // Create an array to hold the monthly totals
    const monthlyTotals = Array.from({ length: 12 }, (_, i) => ({ month: new Date(year, i, 1).toLocaleString('default', { month: 'short' }), amount: 0 }));

    // Update the monthlyTotals array with aggregated data
    expenses.forEach(expense => {
      const monthIndex = expense._id - 1; // MongoDB months are 1-based
      monthlyTotals[monthIndex].amount = expense.totalAmount;
    });

    res.status(200).json({chartData:monthlyTotals});
  } catch (error) {
    console.error('Failed to fetch expenses:', error);
    res.status(500).json({ message: 'Failed to fetch expenses', error: error.message });
  }
};


// Controller function to verify a member
const verifyMember = async (req, res) => {
  try {
    const {id} = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Member ID is required' });
    }

    const member = await Member.findOne({member_id:id}).select("member_id member_photo member_name").lean();

    if (!member) {
      return res.status(404).json({ message: 'Member not found or details do not match' });
    }

    res.status(200).json({ message: 'Member verified successfully', member });
  } catch (error) {
    res.status(500).json({ message: 'Failed to verify member', error: error.message });
  }
};




const getOfferingsByCategoryAndDate = async (req, res) => {
  try {
    const { category, fromdate, todate, page = 1, limit = 10, search="", download } = req.query;
    // console.log(search);
    
    const query = {};

    // Filtering by category
    if (category) query.category = category;

    // Filtering by date range
    if (fromdate) query.date = { ...query.date, $gte: new Date(fromdate) };
    if (todate) query.date = { ...query.date, $lte: new Date(todate) };

    const skip = (page - 1) * limit;

    // First query to filter by category and date
    let offeringsQuery = Offerings.find(query).sort({ createdAt: -1 });

    // If download is true, skip pagination
    if (!download) {
      offeringsQuery = offeringsQuery.skip(skip).limit(parseInt(limit));
    }

    // Fetch the initial filtered results (before search)
    let offerings = await offeringsQuery.lean();

    // Apply search on the fetched data (searching in description, member_id, etc.)
    if (search) {
      const searchNormalized = search.replace(/\s+/g, '').toLowerCase(); // Normalize search term by removing spaces

      offerings = offerings.filter(item => {
        const memberNameNormalized = item.member_name?.replace(/\s+/g, '').toLowerCase() || "";
        const memberIdNormalized = item.member_id?.toLowerCase() || ""; // Just to keep the member_id search intact

        return (
          memberIdNormalized.includes(searchNormalized) || 
          memberNameNormalized.includes(searchNormalized)
        );
      });
    }
    
    // Count total offerings after applying the search
    const total = offerings.length;

    // Calculate total amount based on final filtered data
    const totalAmount = offerings.reduce((acc, offering) => acc + offering.amount, 0);

    // If not downloading, apply pagination to the final search results
    if (!download) {
      offerings = offerings.slice(skip, skip + limit);
    }

    // Return the filtered, paginated, and searched data
    res.status(200).json({
      offerings,
      total,
      totalAmount,
      page: download ? 1 : parseInt(page), // Default to page 1 when downloading
      pages: download ? 1 : Math.ceil(total / limit) // Single page if downloading
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


module.exports = {
  addOffering,
  getMonthlyTotals,
  getDistinctCategories,
  // getOfferingsByCategory,
  // getOfferingsByDateRange,
  // getAll,
  verifyMember,
  getOfferingsByCategoryAndDate,

};